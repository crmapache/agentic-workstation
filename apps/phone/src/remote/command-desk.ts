import type {
  NoticeMessage,
  ResultMessage,
  RemoteErrorCode,
} from '@agentic-workstation/remote-protocol/agent-messages'
import { CAP_PARTS, COMMAND_MEMORY_MS } from '@agentic-workstation/remote-protocol/agent-messages'
import { toBase64Url } from '@agentic-workstation/remote-protocol/base64'
import { utf8Length } from '@agentic-workstation/remote-protocol/body'
import type { CommandArgs, CommandName } from '@agentic-workstation/remote-protocol/commands'
import {
  COMMAND_ARGS,
  COMMAND_PATIENCE_MS,
  MAY_ARRIVE_IN_PARTS,
} from '@agentic-workstation/remote-protocol/commands'
import { MAX_BODY_BYTES } from '@agentic-workstation/remote-protocol/frame'
import { MAX_MESSAGE_BYTES } from '@agentic-workstation/remote-protocol/message-size'
import { splitIntoParts } from '@agentic-workstation/remote-protocol/parts'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'

/**
 * Отказ команды: код IDE (RemoteErrorCode) или свой - offline (линии с IDE нет), timeout (ответ не
 * пришёл), tooBig (сообщение не влезает даже частями), gone (IDE забыта, пока команда шла),
 * partsRefused (IDE не собрала сообщение частями и сказала об этом).
 */
export type CommandFailure =
  RemoteErrorCode | 'offline' | 'timeout' | 'tooBig' | 'gone' | 'partsRefused'

export type CommandOutcome =
  { ok: true; data?: unknown } | { ok: false; code: CommandFailure; detail?: string | undefined }

export type CommandDeskHost = {
  send: (agentId: string, message: object) => Promise<boolean>
  /** Дождаться ключей с IDE (линия переподключается) - или false. */
  whenOpen: (agentId: string, timeoutMs: number) => Promise<boolean>
  caps: (agentId: string) => readonly string[]
  now?: () => number
}

/** Сколько ждать ключей, если команда пришла посреди переподключения. */
export const OPEN_PATIENCE_MS = 10_000

/**
 * Сколько ждать ответа IDE обычной команды: сообщение с фото частями идёт дольше всего. Долгие
 * (вопрос сбоку, поиск модели, черновик сценария) ждут своё - COMMAND_PATIENCE_MS протокола.
 */
export const RESULT_PATIENCE_MS = 45_000

/** Срок ответа этой команды: долгая ждёт столько, сколько её итог идёт у IDE. */
export const patienceOf = (name: CommandName): number =>
  COMMAND_PATIENCE_MS[name] ?? RESULT_PATIENCE_MS

/**
 * Сколько обычную команду можно повторять тем же id после resync: половина того, что IDE помнит
 * её итог. Позже повтор мог бы выполниться второй раз - IDE уже забыла бы, что выполняла. Долгую
 * (вопрос сбоку, черновик) - пока телефон её ждёт: IDE помнит команду, пока она идёт, и
 * COMMAND_MEMORY_MS после итога, а ответ, потерянный обрывом линии, иначе пропал бы.
 */
export const RESEND_WINDOW_MS = COMMAND_MEMORY_MS / 2

const resendWindowOf = (patienceMs: number): number => Math.max(RESEND_WINDOW_MS, patienceMs)

type Waiting = {
  agentId: string
  /** Что уходило: одно слово cmd или его части - повтор шлёт их же, с тем же id. */
  frames: object[]
  startedAt: number
  /** Срок ответа этой команды: повтор после resync ждёт столько же, а не обычные 45 с. */
  patienceMs: number
  resolve: (outcome: CommandOutcome) => void
  timer: ReturnType<typeof setTimeout>
}

const commandId = (): string => toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(12)))

/**
 * Команды телефона IDE: белый список и проверка аргументов - те же схемы, что у IDE, поэтому
 * кривая команда отказывается здесь, не уходя. Ответ находит свою кнопку по id. Тяжёлое (фото)
 * едет частями, если IDE их умеет. Посланное могло пропасть (resync, новая линия): команда без
 * итога уходит снова тем же id, и IDE не выполнит её второй раз.
 */
export class CommandDesk {
  private readonly waiting = new Map<string, Waiting>()

  constructor(private readonly host: CommandDeskHost) {}

  async run<N extends CommandName>(
    agentId: string,
    name: N,
    args: CommandArgs<N>,
  ): Promise<CommandOutcome> {
    if (!COMMAND_ARGS[name].safeParse(args).success) return { ok: false, code: 'badArgs' }
    if (!(await this.host.whenOpen(agentId, OPEN_PATIENCE_MS)))
      return { ok: false, code: 'offline' }

    const id = commandId()
    const frames = this.framesOf(agentId, id, { p: PROTOCOL_VERSION, k: 'cmd', id, name, args })

    if (!frames) return { ok: false, code: 'tooBig' }

    const patienceMs = patienceOf(name)
    const answer = new Promise<CommandOutcome>((resolve) => {
      this.waiting.set(id, {
        agentId,
        frames,
        startedAt: this.now(),
        patienceMs,
        resolve,
        timer: this.patience(id, patienceMs),
      })
    })

    if (!(await this.deliver(agentId, frames))) this.settle(id, { ok: false, code: 'offline' })

    return answer
  }

  /** Ответ IDE на команду. Чужой id (команда уже отвалилась по времени) - мимо. */
  result(message: ResultMessage): void {
    this.settle(
      message.id,
      message.ok
        ? { ok: true, data: message.data }
        : { ok: false, code: message.code, detail: message.detail },
    )
  }

  /** IDE не собрала сообщение частями или отбросила его пределом: команда кончается сразу. */
  noticed(notice: NoticeMessage): void {
    if (!notice.about || notice.code === 'notFound') return

    this.settle(notice.about, { ok: false, code: notice.code })
  }

  /**
   * Посланное этой IDE могло пропасть: команды без итога - снова, теми же id и частями. IDE,
   * получившая первую, отдаст тот же итог; не получившая - выполнит один раз. Старше окна повтора
   * - не повторяются: их итог IDE могла уже забыть (окно долгой команды - срок её ожидания).
   */
  resend(agentId: string): void {
    const now = this.now()

    for (const [id, waiting] of this.waiting) {
      if (waiting.agentId !== agentId) continue
      if (now - waiting.startedAt >= resendWindowOf(waiting.patienceMs)) continue

      clearTimeout(waiting.timer)
      waiting.timer = this.patience(id, waiting.patienceMs)
      void this.deliver(agentId, waiting.frames)
    }
  }

  /** IDE забыта или отпустила телефон: ждущие команды кончаются сразу, а не через минуту. */
  failAll(agentId: string, code: CommandFailure): void {
    for (const [id, waiting] of this.waiting) {
      if (waiting.agentId === agentId) this.settle(id, { ok: false, code })
    }
  }

  /**
   * Команда на провод: целиком, если влезает в кадр, иначе частями (если IDE их умеет и это
   * сообщение с фото). Вес - в байтах, как его посчитает IDE; тяжелее MAX_MESSAGE_BYTES - null.
   */
  private framesOf(
    agentId: string,
    id: string,
    message: { p: number; k: 'cmd'; id: string; name: CommandName; args: unknown },
  ): object[] | null {
    const text = JSON.stringify(message)
    const bytes = utf8Length(text)

    if (bytes <= MAX_BODY_BYTES) return [message]

    const canSplit =
      MAY_ARRIVE_IN_PARTS.has(message.name) && this.host.caps(agentId).includes(CAP_PARTS)

    if (!canSplit || bytes > MAX_MESSAGE_BYTES) return null

    try {
      return splitIntoParts(id, text)
    } catch {
      return null
    }
  }

  private async deliver(agentId: string, frames: readonly object[]): Promise<boolean> {
    for (const frame of frames) {
      if (!(await this.host.send(agentId, frame))) return false
    }

    return true
  }

  private patience(id: string, ms: number): ReturnType<typeof setTimeout> {
    return setTimeout(() => this.settle(id, { ok: false, code: 'timeout' }), ms)
  }

  private settle(id: string, outcome: CommandOutcome) {
    const waiting = this.waiting.get(id)

    if (!waiting) return

    clearTimeout(waiting.timer)
    this.waiting.delete(id)
    waiting.resolve(outcome)
  }

  private now(): number {
    return this.host.now?.() ?? Date.now()
  }
}

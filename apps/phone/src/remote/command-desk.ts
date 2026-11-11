import type {
  ResultMessage,
  RemoteErrorCode,
} from '@agentic-workstation/remote-protocol/agent-messages'
import { CAP_PARTS } from '@agentic-workstation/remote-protocol/agent-messages'
import { toBase64Url } from '@agentic-workstation/remote-protocol/base64'
import { utf8Length } from '@agentic-workstation/remote-protocol/body'
import type { CommandArgs, CommandName } from '@agentic-workstation/remote-protocol/commands'
import { COMMAND_ARGS, MAY_ARRIVE_IN_PARTS } from '@agentic-workstation/remote-protocol/commands'
import { MAX_BODY_BYTES } from '@agentic-workstation/remote-protocol/frame'
import { splitIntoParts } from '@agentic-workstation/remote-protocol/parts'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'

/**
 * Отказ команды: код IDE (RemoteErrorCode) или свой - offline (линии с IDE нет), timeout (ответ не
 * пришёл), tooBig (сообщение не влезает даже частями), gone (IDE забыта, пока команда шла).
 */
export type CommandFailure = RemoteErrorCode | 'offline' | 'timeout' | 'tooBig' | 'gone'

export type CommandOutcome =
  { ok: true; data?: unknown } | { ok: false; code: CommandFailure; detail?: string | undefined }

export type CommandDeskHost = {
  send: (agentId: string, message: object) => Promise<boolean>
  /** Дождаться ключей с IDE (линия переподключается) - или false. */
  whenOpen: (agentId: string, timeoutMs: number) => Promise<boolean>
  caps: (agentId: string) => readonly string[]
}

/** Сколько ждать ключей, если команда пришла посреди переподключения. */
export const OPEN_PATIENCE_MS = 10_000

/** Сколько ждать ответа IDE: сообщение с фото частями идёт дольше всего. */
export const RESULT_PATIENCE_MS = 45_000

/** Место в кадре под конверт печати и запас на экранирование JSON. */
const FRAME_MARGIN = 1024

type Waiting = {
  agentId: string
  resolve: (outcome: CommandOutcome) => void
  timer: ReturnType<typeof setTimeout>
}

const commandId = (): string => toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(12)))

/**
 * Команды телефона IDE: белый список и проверка аргументов - те же схемы, что у IDE, поэтому
 * кривая команда отказывается здесь, не уходя. Ответ находит свою кнопку по id. Тяжёлое (фото)
 * едет частями, если IDE их умеет.
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
    const message = { p: PROTOCOL_VERSION, k: 'cmd', id, name, args }
    const text = JSON.stringify(message)
    const fits = utf8Length(text) <= MAX_BODY_BYTES - FRAME_MARGIN
    const canSplit = MAY_ARRIVE_IN_PARTS.has(name) && this.host.caps(agentId).includes(CAP_PARTS)

    if (!fits && !canSplit) return { ok: false, code: 'tooBig' }

    let parts: object[]

    try {
      parts = fits ? [message] : splitIntoParts(id, text)
    } catch {
      return { ok: false, code: 'tooBig' }
    }

    const answer = new Promise<CommandOutcome>((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id)
        resolve({ ok: false, code: 'timeout' })
      }, RESULT_PATIENCE_MS)

      this.waiting.set(id, { agentId, resolve, timer })
    })

    for (const part of parts) {
      if (!(await this.host.send(agentId, part))) {
        this.settle(id, { ok: false, code: 'offline' })
        break
      }
    }

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

  /** IDE забыта или отпустила телефон: ждущие команды кончаются сразу, а не через минуту. */
  failAll(agentId: string, code: CommandFailure): void {
    for (const [id, waiting] of this.waiting) {
      if (waiting.agentId === agentId) this.settle(id, { ok: false, code })
    }
  }

  private settle(id: string, outcome: CommandOutcome) {
    const waiting = this.waiting.get(id)

    if (!waiting) return

    clearTimeout(waiting.timer)
    this.waiting.delete(id)
    waiting.resolve(outcome)
  }
}

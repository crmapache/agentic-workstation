import { randomUUID } from 'node:crypto'

import type { ImageAttachment } from '@shared/claude'
import type { ConversationFeed } from '@shared/claude-feed'

import type { CliMessage, ControlRequest } from '../cli/cli-messages'
import { ConversationFeedSync } from '../conversation/conversation-feed'
import { isStartupResult } from '../conversation/turn-command'
import type { AiChat, AiChatEvents, AiChatOptions } from '../../connectors/ai/ai-chat'
import type { SessionWires, SessionProcess } from '../../scenarios/engine/scenario-session'
import { turnEndOf, activityOf } from './connector-chat-reading'
import { CHAT_REST_MS } from './connector-chat.constants'

/** Провода процесса и «CLI нет»: фабрика говорит это до того, как отдаст мёртвый процесс. */
export type ChatWires = SessionWires & { onMissing: () => void }

export type ChatDeps = {
  /** Поднять процесс CLI; resume - продолжить разговор с диска, а не начинать его. */
  spawn: (resume: boolean, wires: ChatWires) => SessionProcess
  /** Прошлые ходы разговора - из транскрипта, один раз за жизнь ленты. */
  load: (feed: ConversationFeedSync) => Promise<void>
  thumbnail: (image: ImageAttachment) => string
  /** Разговор закрыт: убрать то, что фабрика положила на диск для процесса. */
  forget: () => Promise<void>
}

/** Последняя строка stderr или код выхода - человеку, когда процесс ушёл посреди хода. */
const exitDetail = (code: number | null, stderrTail: string): string =>
  stderrTail.trim().split('\n').at(-1) || `Claude Code exited with code ${code ?? 'none'}`

/**
 * Разговор о коннекторе на процессе CLI (ADR 0050): поток JSON в обе стороны, лента - та же,
 * что у панели (ConversationFeedSync), ответ каждого хода - по схеме. Ход начинается словами
 * человека или сам (слова не успели в прошлый ход), кончается `result`. После хода процесс
 * ждёт CHAT_REST_MS и засыпает; следующее слово поднимает его заново с `--resume`.
 */
export class ConnectorChat implements AiChat {
  private readonly feedSync: ConversationFeedSync
  private process: SessionProcess | null = null
  private resume: boolean
  private inTurn = false
  /** Процесс только что поднят: его пустой итог после --resume - рукопожатие. */
  private fresh = false
  private stopping = false
  private missing = false
  private disposed = false
  private restTimer: NodeJS.Timeout | null = null
  /** Слова идут в процесс по очереди, после того как лента прочла прошлые ходы. */
  private queue: Promise<void> = Promise.resolve()
  /** Сколько слов ещё в очереди: Stop до их отправки останавливает ход, который они начнут. */
  private pending = 0

  constructor(
    options: AiChatOptions,
    private readonly deps: ChatDeps,
    private readonly events: AiChatEvents,
  ) {
    this.resume = options.resume
    this.feedSync = new ConversationFeedSync(options.sessionId, events.onFeed, deps.thumbnail)
  }

  tell(text: string): void {
    this.pending += 1
    this.queue = this.queue
      .then(async () => {
        await this.deps.load(this.feedSync).catch((error: unknown) => {
          console.warn('[connectors] прошлые ходы разговора не прочитались', error)
        })
        this.deliver(text)
      })
      .catch((error: unknown) => console.warn('[connectors] слова ИИ не ушли', error))
      .finally(() => {
        this.pending -= 1
      })
  }

  stop(): void {
    if (this.inTurn && this.process) {
      this.stopping = true
      this.interrupt(this.process)
    } else if (this.pending > 0) {
      // Слова ещё в пути: ход, который они начнут, остановится сразу (deliver).
      this.stopping = true
    }
  }

  async feed(earlier: boolean): Promise<ConversationFeed> {
    await this.deps.load(this.feedSync)

    return earlier ? this.feedSync.loadEarlier() : this.feedSync.snapshot()
  }

  dispose(): void {
    this.disposed = true
    this.clearRest()
    this.feedSync.dispose()
    void this.process?.stop()
    this.process = null
    void this.deps.forget()
  }

  private deliver(text: string) {
    if (this.disposed) return

    const uuid = randomUUID()
    // Посреди хода CLI кладёт слова между шагами - так их показывает и лента.
    const steering = this.inTurn

    this.clearRest()
    this.feedSync.builder.addUserMessage(uuid, text, [], steering)
    this.feedSync.schedule()
    this.inTurn = true

    const process = this.process?.isAlive ? this.process : this.raise()

    process.write({
      type: 'user',
      uuid,
      message: { role: 'user', content: [{ type: 'text', text }] },
    })

    if (this.stopping) this.interrupt(process)
  }

  /** Процесс ушёл раньше ответа на остановку - ход закроет его выход (exited). */
  private interrupt(process: SessionProcess) {
    process.control({ subtype: 'interrupt' }).catch(() => undefined)
  }

  private raise(): SessionProcess {
    this.missing = false
    this.feedSync.builder.startProcess()

    const process: SessionProcess = this.deps.spawn(this.resume, {
      onMessage: (message) => {
        if (this.process === process) this.heard(message)
      },
      onControlRequest: (request) => {
        if (this.process === process) this.refuse(process, request)
      },
      onExit: (code, stderrTail) => {
        if (this.process === process) this.exited(code, stderrTail)
      },
      onMissing: () => {
        this.missing = true
      },
    })

    this.process = process
    this.fresh = true

    return process
  }

  private heard(message: CliMessage) {
    if (message.type === 'result') return this.finished(message)

    const isMain = !message['parent_tool_use_id'] && !message['task_id']
    const isInit = message.type === 'system' && message.subtype === 'init' && isMain

    // CLI заговорил - разговор есть на диске: следующий подъём - поверх него. Процесс, который
    // не поднялся, разговора не завёл, и --resume для него упал бы.
    if (isInit && !this.resume) {
      this.resume = true
      this.events.onSaved()
    }

    if (isInit && !this.inTurn) {
      this.inTurn = true
      this.clearRest()
      this.events.onTurnStarted()
    }

    const activity = activityOf(message)

    if (activity) this.events.onActivity(activity)

    this.feedSync.builder.apply(message)
    this.feedSync.schedule()
  }

  private finished(result: CliMessage) {
    if (isStartupResult(result, this.fresh, this.stopping)) {
      this.fresh = false

      return
    }

    const stopped = this.stopping

    this.fresh = false
    this.stopping = false
    this.inTurn = false
    this.feedSync.builder.finishTurn(result, stopped)
    this.feedSync.flush()
    this.rest()
    this.events.onTurnEnded(turnEndOf(result, stopped))
  }

  /** Спросить разрешения не у кого (dontAsk): любой вопрос CLI - отказ, иначе ход повиснет. */
  private refuse(process: SessionProcess, request: ControlRequest) {
    if (request.type === 'control_cancel_request') return

    process.write({
      type: 'control_response',
      response: { subtype: 'error', request_id: request.request_id, error: 'Unsupported request' },
    })
  }

  private exited(code: number | null, stderrTail: string) {
    this.process = null

    if (this.disposed || !this.inTurn) return

    const stopped = this.stopping
    const detail = this.missing ? '' : exitDetail(code, stderrTail)

    this.inTurn = false
    this.stopping = false
    this.feedSync.builder.abortTurn(this.missing ? 'start-failed' : 'process-exited', detail)
    this.feedSync.flush()
    this.events.onTurnEnded(
      stopped
        ? { kind: 'stopped' }
        : { kind: 'failed', error: this.missing ? 'cli-missing' : 'failed', detail },
    )
  }

  /** Ход кончился: процесс засыпает, если до срока ему ничего не написали. */
  private rest() {
    this.clearRest()
    this.restTimer = setTimeout(() => {
      this.restTimer = null

      if (this.inTurn || !this.process) return

      const sleeping = this.process

      // Свой сон - не падение: выход этого процесса уже никто не слушает.
      this.process = null
      void sleeping.stop()
    }, CHAT_REST_MS)
    this.restTimer.unref()
  }

  private clearRest() {
    if (this.restTimer) clearTimeout(this.restTimer)

    this.restTimer = null
  }
}

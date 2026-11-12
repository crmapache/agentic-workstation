import type { ImageAttachment } from '@shared/claude'

import type { CliMessage, ControlRequest } from '../../claude/cli/cli-messages'
import { numberField, recordField, stringField } from '../../claude/cli/cli-messages'
import type { CardAsk } from './run-mail'

/** Что сессии нужно от процесса CLI - CliProcess или подделка в тесте. */
export type SessionProcess = {
  readonly isAlive: boolean
  write: (message: object) => void
  control: (request: Record<string, unknown>) => Promise<unknown>
  respond: (requestId: string, response: Record<string, unknown>) => void
  stop: () => Promise<void>
}

/** С чем поднять процесс головы или карточки. */
export type SessionSpec = {
  sessionId: string
  /** Транскрипт есть на диске: продолжить его (`--resume`), а не начинать с этим id. */
  resume: boolean
  model: string
  effort: string
  permissionMode: string
  /** Одна строка без кавычек - аргумент `--append-system-prompt`. */
  briefing: string
  accountId: string
  /**
   * Файл серверов шлюза коннекторов на этот процесс; нет - без коннекторов. Ставит
   * провайдер при подъёме: движок о коннекторах не знает.
   */
  mcpConfig?: string | null
}

export type SessionWires = {
  onMessage: (message: CliMessage) => void
  onControlRequest: (request: ControlRequest) => void
  onExit: (code: number | null, stderrTail: string) => void
}

/** Поднять процесс; null - CLI нет (сказано ошибкой сессии). */
export type SessionSpawn = (spec: SessionSpec, wires: SessionWires) => SessionProcess | null

export type SessionEvents = {
  onMessage: (message: CliMessage) => void
  /** Ход начался сам: отчёт фонового помощника, а не наше сообщение. */
  onTurnStarted: () => void
  onTurnEnded: (result: CliMessage) => void
  onAsk: (ask: CardAsk) => void
  onWithdrawn: (requestId: string) => void
  /** Процесс не поднялся или не принял сообщение. */
  onError: (message: string) => void
  /** Процесс ушёл сам, посреди жизни. */
  onCrashed: () => void
}

/**
 * Сессия CLI головы или карточки (ClaudeSession в ACC, без вкладки): процесс поднимается
 * первым сообщением, ход начинается нашим сообщением или сам (`system/init` без нашего), а
 * кончается `result`. Наша собственная остановка - не падение.
 */
export class ScenarioSession {
  private process: SessionProcess | null = null
  private inTurn = false
  private stopped = false
  private heard = false
  /** Процесс только что поднят: его первый пустой итог - рукопожатие. */
  private fresh = false
  private resume: boolean

  constructor(
    private readonly spawn: SessionSpawn,
    private readonly spec: SessionSpec,
    private readonly events: SessionEvents,
  ) {
    this.resume = spec.resume
  }

  /** Разговор CLI: известен до первого ответа - процесс поднимается под этим id. */
  get conversationId(): string {
    return this.spec.sessionId
  }

  get model(): string {
    return this.spec.model
  }

  get accountId(): string {
    return this.spec.accountId
  }

  get isTurnOpen(): boolean {
    return this.inTurn
  }

  /** Сообщение в разговор; false - процесс не поднялся (ошибка уже сказана). */
  sendPrompt(text: string, images: readonly ImageAttachment[] = []): boolean {
    if (this.stopped) return false

    const process = this.process?.isAlive ? this.process : this.raise()

    if (!process) return false

    const content = [
      ...images.map((image) => ({
        type: 'image',
        source: { type: 'base64', media_type: image.mediaType, data: image.data },
      })),
      ...(text ? [{ type: 'text', text }] : []),
    ]

    this.inTurn = true
    process.write({ type: 'user', message: { role: 'user', content } })

    return true
  }

  /** Как Escape за столом: ход обрывается, процесс помнит всё. */
  interrupt(): void {
    this.process?.control({ subtype: 'interrupt' }).catch(() => undefined)
  }

  /** Ответ на вопрос разрешения или вопрос с вариантами. */
  answer(requestId: string, allow: boolean, message: string, input: Record<string, unknown>) {
    this.process?.respond(
      requestId,
      allow
        ? { behavior: 'allow', updatedInput: input }
        : { behavior: 'deny', message: message.trim() || 'Refused.' },
    )
  }

  stop(): void {
    this.stopped = true
    void this.process?.stop()
    this.process = null
  }

  private raise(): SessionProcess | null {
    const process = this.spawn(
      { ...this.spec, resume: this.resume },
      {
        onMessage: (message) => {
          if (this.process === process) this.heardLine(message)
        },
        onControlRequest: (request) => {
          if (process && this.process === process) this.heardRequest(process, request)
        },
        onExit: (code, stderrTail) => {
          if (this.process === process) this.exited(code, stderrTail)
        },
      },
    )

    if (!process) this.events.onError('Claude Code executable not found.')

    this.process = process
    this.fresh = true
    // Следующий подъём того же разговора - поверх его транскрипта.
    this.resume = true

    return process
  }

  private heardLine(message: CliMessage) {
    this.events.onMessage(message)

    const isMain = !message['parent_tool_use_id'] && !message['task_id']

    if (message.type === 'system' && message.subtype === 'init' && isMain) {
      this.heard = true

      if (!this.inTurn) {
        this.inTurn = true
        this.events.onTurnStarted()
      }
    }

    if (message.type !== 'result') return

    // Пустой итог свежего процесса после --resume - рукопожатие, а не ход: он приходит и
    // после нашего первого сообщения, и закрыл бы ход, который ещё не начался.
    const handshake =
      numberField(message, 'num_turns') === 0 &&
      !stringField(message, 'result') &&
      message['is_error'] !== true
    const fresh = this.fresh

    this.fresh = false

    if (handshake && (fresh || !this.inTurn)) return

    this.inTurn = false
    this.events.onTurnEnded(message)
  }

  private heardRequest(process: SessionProcess, request: ControlRequest) {
    if (request.type === 'control_cancel_request')
      return this.events.onWithdrawn(request.request_id)

    const body = request.request ?? {}

    if (body.subtype !== 'can_use_tool') {
      return process.write({
        type: 'control_response',
        response: {
          subtype: 'error',
          request_id: request.request_id,
          error: 'Unsupported request',
        },
      })
    }

    this.events.onAsk({
      requestId: request.request_id,
      toolName: stringField(body, 'tool_name'),
      input: recordField(body, 'input'),
      description: stringField(body, 'description'),
    })
  }

  private exited(code: number | null, stderrTail: string) {
    this.process = null
    this.inTurn = false

    if (this.stopped) return

    if (!this.heard) {
      const said = stderrTail.trim().split('\n').at(-1) ?? ''

      return this.events.onError(said || `Claude Code exited with code ${code ?? 'none'}`)
    }

    this.events.onCrashed()
  }
}

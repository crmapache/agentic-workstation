import { randomUUID } from 'node:crypto'

import type { PermissionMode, RequestResponse } from '@shared/conversation'

import type { AcpProcess } from '../client/acp-process'
import { errorTextOf, isAuthError } from '../client/acp-process'
import { ACP_PROMPT_TIMEOUT_MS, ACP_SESSION_TIMEOUT_MS } from '../client/acp.constants'
import type {
  AcpMcpServer,
  AcpContentBlock,
  AcpPromptResult,
  AcpSessionSetup,
  AcpInitializeResult,
} from '../protocol/acp-types'
import type { HeldRequest, AgentSession } from '../../agents/conversation/agent-parts'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { draftTitle, isSlashCommand } from '../../agents/conversation/conversation.utils'
import { editorNote } from '../../agents/conversation/editor-note'
import type { Outgoing } from '../../agents/conversation/outbox'
import { takeReleasedFrame } from '../../agents/history/released-runs'
import { rankOf } from '../../agents/tabs/tab-names'
import { acpOf } from './acp-conversation'
import { applySettings } from './acp-options'
import type { AcpHeld } from './acp-requests'
import { replyOf, isAcpHeld, dismissedReply } from './acp-requests'
import { routeUpdate, routeRequest } from './acp-router'

let epochs = 0

/**
 * Живая сессия разговора у агента ACP (ADR 0092): процесс агента и сессия в нём. Сообщение -
 * `session/prompt`, ход кончается его ответом; Stop - `session/cancel`; вопросы - ответы на
 * запросы агента. Сообщение посреди хода ждёт его конца внутри сессии (у `agy` второй промпт
 * вытесняет первый) и уходит следующим ходом. Модель, усилие и режим - перед ходом, если
 * поменялись.
 */
export class AcpSession implements AgentSession {
  readonly epoch = (epochs += 1)
  sessionId = ''
  init: AcpInitializeResult | null = null
  /** Последний ответ агента о настройках сессии: модели, размышление, режимы. */
  setup: AcpSessionSetup = {}
  /** Режим, с которым поднят процесс: по нему видно, нужен ли новый процесс для нового режима. */
  launchedMode: PermissionMode = 'default'
  /**
   * Слова посреди хода ACP не принимает (у `agy` второй промпт вытесняет первый): сообщение,
   * написанное во время хода, ждёт в очереди разговора и уходит само после хода.
   */
  readonly steers = false

  constructor(
    readonly runtime: ConversationRuntime,
    readonly process: AcpProcess,
    private readonly servers: AcpMcpServer[],
  ) {}

  get isAlive(): boolean {
    return this.process.isAlive
  }

  get isStopping(): boolean {
    return this.process.isStopping
  }

  /** Своя ли ещё сессия у разговора: заменённая события в разговор не несёт. */
  get isCurrent(): boolean {
    return this.runtime.session === this
  }

  /**
   * Сессия разговора: продолжить прошлую (`session/resume` без повтора истории - ленту уже
   * повторил каталог) или начать новую в папке проекта; id новой - разговору.
   */
  async begin(): Promise<void> {
    const { meta } = this.runtime
    const { host } = acpOf(this.runtime)
    const init = await this.process.initialized
    const sessions = init.agentCapabilities?.sessionCapabilities ?? {}
    const extra = host.agent.instructions?.(host.instructions(meta.projectPath)) ?? {}
    const base = { cwd: meta.projectPath, mcpServers: this.servers, ...extra }

    this.init = init

    if (meta.sessionId && sessions.resume) {
      const resumed = await this.process
        .request('session/resume', { ...base, sessionId: meta.sessionId }, ACP_SESSION_TIMEOUT_MS)
        .catch((error: unknown) => {
          if (isAuthError(error)) throw error

          // Агент не продолжил разговор (занят другим процессом, разговора нет): новый, и об этом
          // строка в ленте - история на экране есть, а модель её не помнит.
          const { feed } = acpOf(this.runtime)

          feed.builder.addNotice(
            'cli-error',
            `Could not continue the previous conversation (${error instanceof Error ? error.message : String(error)}). This is a new one.`,
          )
          feed.schedule()

          return null
        })

      if (resumed) {
        this.sessionId = meta.sessionId
        this.noteSetup(resumed)
      }
    }

    if (!this.sessionId) {
      const created = (await this.process.request(
        'session/new',
        base,
        ACP_SESSION_TIMEOUT_MS,
      )) as AcpSessionSetup

      if (!created.sessionId) throw new Error(`${host.agent.tag}: сессия без id`)

      this.sessionId = created.sessionId
      this.runtime.update({ sessionId: created.sessionId })
      void host.agent.notePlace?.(created.sessionId, meta.projectPath)
      this.noteSetup(created)
    }

    await applySettings(this)
  }

  /** Ответ агента о сессии: меню панели, режим, о себе (`_meta`). */
  noteSetup(setup: AcpSessionSetup): void {
    const { host } = acpOf(this.runtime)

    this.setup = { ...this.setup, ...setup }
    host.onSetup(setup)
  }

  send(message: Outgoing, steering: boolean): void {
    const { runtime } = this
    const { feed } = acpOf(runtime)
    const id = randomUUID()
    const { text } = message

    // Догадка по первому сообщению - только поверх заглушки: имя от агента и человека не перебивает.
    if (rankOf(runtime.meta.titleSource) < rankOf('heuristic') && text && !message.auto) {
      runtime.update({ title: draftTitle(text), titleSource: 'heuristic' })
    }

    if (message.images.length > 0) {
      feed.images.set(
        id,
        message.images.map((image) => `data:${image.mediaType};base64,${image.data}`),
      )
    }

    feed.builder.addUserMessage(id, text, message.images, steering, {
      draft: message.draft ?? undefined,
      editor: (isSlashCommand(text) ? null : message.editor) ?? undefined,
      auto: message.auto,
    })
    feed.schedule()

    void this.prompt(message)
  }

  /**
   * Человек ответил в чат, пока ход стоял на вопросе: вопросу отказ, а сообщение ждёт в очереди
   * разговора конца хода - посреди хода ACP слов не принимает.
   */
  answerInChat(held: HeldRequest, message: Outgoing): void {
    this.dismiss(held)
    void this.runtime.enqueue(message)
  }

  answer(held: HeldRequest, response: RequestResponse): void {
    if (!isAcpHeld(held)) return

    const reply = replyOf(held, response)

    if (held.source === 'permission' && response.kind === 'permission') {
      if (response.decision.behavior === 'deny') this.denied(held)
    }

    held.reply(reply)

    if (held.source !== 'plan' || response.kind !== 'plan') return

    if (response.approved) {
      // Агент вышел из плана сам и об этом не сообщает (Kimi): режим вкладки - рабочий, как у
      // Claude и Codex после одобрения; следующий ход поставит его агенту.
      const { modes } = acpOf(this.runtime).host.agent
      const accept = response.acceptEdits && modes.includes('acceptEdits')

      this.runtime.update({ permissionMode: accept ? 'acceptEdits' : 'default' })

      return
    }

    // Доработать план - замечание человека ждёт конца хода в очереди разговора.
    const feedback = response.feedback.trim()

    if (feedback) void this.runtime.enqueue({ text: feedback, images: [] })
  }

  /** Снятый вопрос: разрешению и плану - отказ без выбора, форме - отмена. */
  dismiss(held: HeldRequest): void {
    if (!isAcpHeld(held)) return

    if (held.source === 'permission') this.denied(held)
    held.reply(dismissedReply(held))
  }

  /** Stop: `session/cancel`; ход кончится ответом агента с `cancelled`. */
  interrupt(): Promise<void> {
    this.process.notify('session/cancel', { sessionId: this.sessionId })

    return Promise.resolve()
  }

  stop(): Promise<void> {
    return this.process.stop()
  }

  kill(): void {
    this.process.kill()
  }

  /** Уведомление агента: обновление своей сессии - в ленту и разговор. */
  handleNotification(method: string, params: unknown): void {
    if (!this.isCurrent || method !== 'session/update') return

    routeUpdate(this, params)
  }

  /** Запрос агента: вопрос человеку или отказ, если клиент так не умеет. */
  handleRequest(method: string, params: unknown): Promise<unknown> {
    return routeRequest(this, method, params)
  }

  /** Процесс вышел: посреди хода - обрыв строкой, иначе тихо. */
  handleExit(code: number | null, stderrTail: string): void {
    if (!this.isCurrent) return

    const { runtime } = this
    const detail = exitDetail(stderrTail, code)
    const stopped = runtime.meta.stopRequestedAt !== null

    runtime.sessionEnded(
      this,
      runtime.turnActive ? { code: stopped ? 'interrupted' : 'process-exited', detail } : null,
    )
  }

  /** Ход: блоки сообщения, настройки сессии, `session/prompt`; конец - ответом агента. */
  private async prompt(message: Outgoing): Promise<void> {
    const { runtime } = this
    const kit = acpOf(runtime)

    kit.feed.builder.turnStarted()

    try {
      await applySettings(this)

      const result = (await this.process.request(
        'session/prompt',
        { sessionId: this.sessionId, prompt: this.blocksOf(message) },
        ACP_PROMPT_TIMEOUT_MS,
      )) as AcpPromptResult

      this.turnEnded(result.stopReason, null)
    } catch (error) {
      if (!this.isCurrent || !this.process.isAlive) return

      // Вход истёк посреди разговора: строка «войдите» с кнопкой входа, ход - с ошибкой, очередь
      // ждёт входа, а не уходит сообщение за сообщением в тот же отказ.
      if (isAuthError(error)) {
        kit.host.onSignedOut()
        kit.feed.builder.addNotice('not-logged-in', error instanceof Error ? error.message : '')
        this.turnEnded('end_turn', '')

        return
      }

      this.turnEnded('end_turn', errorTextOf(error))
    }
  }

  /** Текст с рамкой снятого прогона, выводом команд `!` и заметкой о редакторе; картинки. */
  private blocksOf(message: Outgoing): AcpContentBlock[] {
    const { shells } = acpOf(this.runtime)
    const command = isSlashCommand(message.text)
    const shell = command ? '' : shells.takeContext()
    const frame = command ? '' : takeReleasedFrame(this.sessionId)
    const editor = command ? null : (message.editor ?? null)
    const text = [frame, shell, message.text, editor ? editorNote(editor) : '']
      .filter(Boolean)
      .join('\n\n')

    return [
      { type: 'text', text },
      ...message.images.map((image): AcpContentBlock => ({
        type: 'image',
        data: image.data,
        mimeType: image.mediaType,
      })),
    ]
  }

  /**
   * Ход кончился: лента, свободная вкладка, исход, зов; потом очередь и сон, как у всех. error -
   * текст сбоя (пусто - сбой уже объяснён строкой ленты), null - ход кончился сам.
   */
  private turnEnded(stopReason: string, error: string | null): void {
    const { runtime } = this
    const { feed, host } = acpOf(runtime)
    const interrupted = stopReason === 'cancelled' || runtime.meta.stopRequestedAt !== null
    const isError = error !== null

    feed.builder.turnCompleted({ stopReason, error: error ?? '' })
    runtime.settleTurn({ interrupted, isError, usage: runtime.meta.usage })

    if (!interrupted) host.onCall(runtime.meta.id, isError ? 'error' : 'turnDone')
    runtime.afterTurn(!interrupted && !isError)
  }

  /** Вызов, которому человек отказал, - отказом в ленте, а не ошибкой. */
  private denied(held: AcpHeld): void {
    const { feed } = acpOf(this.runtime)

    if (!held.pending.toolUseId) return

    feed.builder.toolDenied(held.pending.toolUseId)
    feed.schedule()
  }
}

/**
 * Причина падения агента строкой ленты: последняя осмысленная строка stderr (у Kimi там бывают
 * многострочные дампы - «}» не причина), иначе код выхода.
 */
const exitDetail = (stderrTail: string, code: number | null): string =>
  stderrTail
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /[A-Za-z0-9]/.test(line) && !/^[\]})]+,?$/.test(line))
    .at(-1) ?? (code === null ? '' : String(code))

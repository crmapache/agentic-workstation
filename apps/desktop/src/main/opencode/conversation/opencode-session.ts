import { randomUUID } from 'node:crypto'

import type { RequestResponse } from '@shared/conversation'

import type { OpenCodeEvent, OpenCodeServer } from '../server/opencode-server'
import { dataOf, OpenCodeReplyError } from '../server/opencode-server'
import type { HeldRequest, AgentSession } from '../../agents/conversation/agent-parts'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { draftTitle, isSlashCommand } from '../../agents/conversation/conversation.utils'
import { editorNote } from '../../agents/conversation/editor-note'
import type { Outgoing } from '../../agents/conversation/outbox'
import { voiceNote } from '../../agents/conversation/voice-note'
import { takeReleasedFrame } from '../../agents/history/released-runs'
import { rankOf } from '../../agents/tabs/tab-names'
import { openCodeOf } from './opencode-conversation'
import type { OpenCodeHeld } from './opencode-requests'
import { formAnswer, isOpenCodeHeld, permissionReply } from './opencode-requests'
import { routeEvent, CHILD_EVENTS, eventSessionOf } from './opencode-router'
import { OpenCodeSessionSettings } from './opencode-session-settings'
import { isSessionOf } from './session-place'

let epochs = 0

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Команда сжатия: у OpenCode это свой вызов, а не сообщение модели. */
const COMPACT = /^\/compact\s*$/

/**
 * Живая сессия разговора у OpenCode (ADR 0084): процесс `opencode serve --stdio` и сессия
 * разговора в нём. Сообщение - `prompt` (посреди хода - доставкой `steer`), вопросы - ответы на
 * разрешения и формы, остановка - `interrupt`. Модель, агент и правила режима сессия получает
 * перед ходом, если поменялись (OpenCodeSessionSettings): смена посреди разговора - без перезапуска.
 */
export class OpenCodeSession implements AgentSession {
  readonly epoch = (epochs += 1)
  sessionId = ''
  /** Окно контекста модели разговора - для кольца контекста. */
  contextWindow = 0
  /**
   * Сессии субагентов разговора: OpenCode заводит их без правил режима, а смотрит только
   * правила агента и самой сессии - правила режима им ставит IDE, их вопросы идут в разговор.
   */
  private readonly children = new Set<string>()
  private readonly settings: OpenCodeSessionSettings

  /**
   * env - окружение человека (его оболочка входа): его получают команды агента, а не окружение
   * процесса OpenCode, где лежат конфиг, пароль и свои папки IDE (`XDG_*`).
   */
  constructor(
    readonly runtime: ConversationRuntime,
    readonly server: OpenCodeServer,
    private readonly env: Readonly<Record<string, string>>,
  ) {
    this.settings = new OpenCodeSessionSettings(runtime, server)
  }

  get isAlive(): boolean {
    return this.server.isAlive
  }

  get isStopping(): boolean {
    return this.server.isStopping
  }

  /** Своя ли ещё сессия у разговора: заменённая события в разговор не несёт. */
  get isCurrent(): boolean {
    return this.runtime.session === this
  }

  /**
   * Сессия разговора: продолжить прошлую (её нет в базе или она чужой папки - новая) или начать новую в папке
   * проекта; id новой - разговору, по нему он продолжится после перезапуска.
   */
  async begin(): Promise<void> {
    const { meta } = this.runtime
    // Чужой папки сессия не продолжается: OpenCode вёл бы её в той папке, мимо коннекторов этой.
    const known = meta.sessionId
      ? await this.server
          .request('GET', `/api/session/${meta.sessionId}`)
          .then((reply) => (isSessionOf(dataOf(reply), meta.projectPath) ? meta.sessionId : ''))
          .catch((error: unknown) => {
            if (error instanceof OpenCodeReplyError && error.status === 404) return ''
            throw error
          })
      : ''

    if (known) {
      this.sessionId = known
      await this.applySettings()
    } else {
      this.sessionId = await this.settings.create()
      this.runtime.update({ sessionId: this.sessionId })
    }

    // Команды агента - в окружении человека: ни ключи конфига, ни папки OpenCode им не видны,
    // а `gh`, git и pnpm видят свои настройки (замерено: без этого видно всё окружение сервера).
    await this.server.request('PUT', `/api/session/${this.sessionId}/environment`, {
      body: { variables: this.env },
    })

    this.contextWindow = this.settings.contextWindow()
  }

  send(message: Outgoing, steering: boolean): void {
    const { runtime } = this
    const { feed, shells } = openCodeOf(runtime)
    const id = randomUUID()
    const { text } = message

    // Догадка по первому сообщению - только поверх заглушки: имя от модели и человека она не перебивает.
    if (rankOf(runtime.meta.titleSource) < rankOf('heuristic') && text && !message.auto) {
      runtime.update({ title: draftTitle(text), titleSource: 'heuristic' })
    }

    // Команда - приказ разговору, а не вопрос про код: заметку о редакторе она не несёт.
    const editor = isSlashCommand(text) ? null : (message.editor ?? null)
    const voice = isSlashCommand(text) ? null : (message.voice ?? null)

    if (message.images.length > 0) {
      feed.images.set(
        id,
        message.images.map((image) => `data:${image.mediaType};base64,${image.data}`),
      )
    }

    feed.builder.addUserMessage(id, text, message.images, steering, {
      draft: message.draft ?? undefined,
      editor: editor ?? undefined,
      auto: message.auto,
      voice: voice ? { lang: voice.lang } : undefined,
    })
    feed.schedule()

    if (!steering && COMPACT.test(text.trim())) {
      feed.builder.compactRequested()
      this.call(() =>
        this.server.request('POST', `/api/session/${this.sessionId}/compact`, {
          body: {},
        }),
      )

      return
    }

    const shell = isSlashCommand(text) ? '' : shells.takeContext()
    // Прогон IDE, открытый чатом: рамка о снятой роли - перед первым словом человека.
    const frame = isSlashCommand(text) ? '' : takeReleasedFrame(this.sessionId)
    const body = {
      text: [
        frame,
        shell,
        text,
        voice ? voiceNote(voice.lang, voice.heard) : '',
        editor ? editorNote(editor) : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      files: message.images.map((image, index) => ({
        uri: `data:${image.mediaType};base64,${image.data}`,
        name: `image-${index + 1}.${image.mediaType.split('/')[1] ?? 'png'}`,
      })),
      delivery: steering ? 'steer' : 'queue',
    }

    this.call(async () => {
      if (!steering) await this.applySettings()

      const reply = dataOf(
        await this.server.request('POST', `/api/session/${this.sessionId}/prompt`, { body }),
      )

      // Откат и форк называют сообщение id OpenCode, а лента - своим.
      if (isRecord(reply) && typeof reply['id'] === 'string') {
        feed.noteOpenCodeId(id, reply['id'])
      }
    }, !steering)
  }

  /** Человек ответил в чат, пока ход стоял на вопросе: сообщение посреди хода, вопросу - отказ. */
  answerInChat(held: HeldRequest, message: Outgoing): void {
    this.send(message, this.runtime.turnActive)
    this.dismiss(held)
  }

  answer(held: HeldRequest, response: RequestResponse): void {
    if (!isOpenCodeHeld(held)) return

    if (held.source === 'form') {
      void this.reply(held, { answer: formAnswer(held, response) })

      return
    }

    // «Разрешить в этом разговоре» - правилом сессии, а не сохранённым навсегда разрешением.
    if (response.kind === 'permission' && response.decision.behavior === 'allowAlways') {
      openCodeOf(this.runtime).allowedHere.add(held.action)
      void this.applySettings().catch(() => undefined)
    }

    const decision = permissionReply(response)

    if (decision === 'reject') this.denied(held)
    void this.reply(held, { decision })
  }

  /** Снятый вопрос - отказом; форма - отменой. */
  dismiss(held: HeldRequest): void {
    if (!isOpenCodeHeld(held)) return

    if (held.source === 'form') {
      void this.server
        .request('DELETE', `/api/session/${this.askedBy(held)}/form/${held.openCodeId}`)
        .catch(() => undefined)
    } else {
      this.denied(held)
      void this.reply(held, { decision: 'reject' })
    }
  }

  /** Stop - ход разговора и фоновые субагенты: остановленный разговор не работает дальше в фоне. */
  async interrupt(): Promise<void> {
    const { builder } = openCodeOf(this.runtime).feed

    await Promise.all([
      this.server.request('POST', `/api/session/${this.sessionId}/interrupt`),
      ...builder.runningSubagents.map((child) =>
        this.server.request('POST', `/api/session/${child}/interrupt`).catch(() => undefined),
      ),
    ])
  }

  stop(): Promise<void> {
    return this.server.stop()
  }

  kill(): void {
    this.server.kill()
  }

  /**
   * Событие сервера своей сессии - в ленту и разговор; у субагента - только его вопросы
   * человеку. Заменённая сессия молчит.
   */
  handleEvent(event: OpenCodeEvent): void {
    if (!this.isCurrent) return

    const sessionId = eventSessionOf(event.data)
    const parentId = event.data['parentID']

    if (sessionId === this.sessionId) {
      routeEvent(this, event)
    } else if (event.type === 'session.created' && typeof parentId === 'string') {
      if (parentId === this.sessionId || this.children.has(parentId)) this.adopt(sessionId)
    } else if (this.children.has(sessionId)) {
      if (CHILD_EVENTS.has(event.type)) routeEvent(this, event)
      else if (event.type.startsWith('session.execution.')) {
        this.childRunning(sessionId, event.type === 'session.execution.started')
      }
    }
  }

  /** Процесс вышел: посреди хода - обрыв строкой, иначе тихо. */
  handleExit(code: number | null, stderrTail: string): void {
    if (!this.isCurrent) return

    const { runtime } = this
    const detail = stderrTail.trim().split('\n').at(-1) ?? (code === null ? '' : String(code))
    const stopped = runtime.meta.stopRequestedAt !== null

    runtime.sessionEnded(
      this,
      runtime.turnActive ? { code: stopped ? 'interrupted' : 'process-exited', detail } : null,
    )
  }

  /** Субагент разговора: его вопросы идут в разговор, правила режима - и ему. */
  private adopt(childId: string): void {
    if (!childId) return

    this.children.add(childId)
    this.settings.adopt(childId)
  }

  /** Ход субагента начался или кончился: точка вкладки, сон и отложенный перезапуск. */
  private childRunning(childId: string, running: boolean): void {
    const { runtime } = this

    openCodeOf(runtime).feed.builder.subagentRunning(childId, running)
    runtime.syncStatus()
    if (!running) runtime.applyPendingRestart()
  }

  /** Сессия, которая задала вопрос: своя или субагента. */
  private askedBy(held: OpenCodeHeld): string {
    return held.sessionId || this.sessionId
  }

  /** Вызов, которому человек отказал, - отказом в ленте, а не ошибкой. */
  private denied(held: OpenCodeHeld): void {
    const { feed } = openCodeOf(this.runtime)

    if (!held.pending.toolUseId) return

    feed.builder.toolDenied(held.pending.toolUseId)
    feed.schedule()
  }

  /** Модель, агент и правила режима - сессии и субагентам, если поменялись с прошлого раза. */
  private async applySettings(): Promise<void> {
    if (await this.settings.apply(this.sessionId, this.children)) {
      this.contextWindow = this.settings.contextWindow()
    }
  }

  private async reply(held: OpenCodeHeld, body: unknown): Promise<void> {
    const kind = held.source === 'form' ? 'form' : 'permission'

    await this.server
      .request('POST', `/api/session/${this.askedBy(held)}/${kind}/${held.openCodeId}/reply`, {
        body,
      })
      .catch((error: unknown) => console.warn('[opencode] ответ на вопрос не принят:', error))
  }

  /**
   * Запрос хода. Отказ сервера (модели нет, подключение не отвечает) - ошибка строкой; если
   * запрос начинал ход, ход не начался: вкладка свободна, очередь ждёт человека.
   */
  private call(request: () => Promise<unknown>, startsTurn = true) {
    request().catch((error: unknown) => {
      if (!this.isCurrent) return

      const { runtime } = this
      const { feed } = openCodeOf(runtime)

      feed.builder.addNotice('cli-error', error instanceof Error ? error.message : String(error))
      feed.flush()

      if (!startsTurn) return

      runtime.settleTurn({ interrupted: false, isError: true, usage: runtime.meta.usage })
      runtime.host.onCall(runtime.meta.id, 'error')
      runtime.afterTurn(false)
    })
  }
}

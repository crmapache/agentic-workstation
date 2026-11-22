import { randomUUID } from 'node:crypto'

import type { RequestResponse } from '@shared/conversation'
import type { EditorRef } from '@shared/message-draft'
import type { VoiceOutgoing } from '@shared/voice'

import type { AppServerProcess } from '../app-server/app-server-process'
import { defaultsFromConfig } from '../catalog/catalog-shapes'
import type { RpcId } from '../../process/rpc-lines'
import type { HeldRequest, AgentSession } from '../../agents/conversation/agent-parts'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { draftTitle, isSlashCommand } from '../../agents/conversation/conversation.utils'
import { editorNote } from '../../agents/conversation/editor-note'
import type { Outgoing } from '../../agents/conversation/outbox'
import { voiceNote } from '../../agents/conversation/voice-note'
import { releasedBriefing, takeReleasedFrame } from '../../agents/history/released-runs'
import { rankOf } from '../../agents/tabs/tab-names'
import type { CodexSkill, CodexCommand } from './codex-commands'
import { commandOf, skillCommands, skillsFromList } from './codex-commands'
import { codexOf } from './codex-conversation'
import { tierOf, tierField, fastReportOf, noteFastReport } from './codex-fast'
import type { CodexChoice, CodexWorkspace } from './codex-modes'
import { choiceOf, policyFor, workspaceFromConfig } from './codex-modes'
import type { ProposedPlan } from './codex-plan'
import { decidePlan, isPlanHeld } from './codex-plan'
import { answerFor, declineFor, isCodexHeld } from './codex-requests'
import { routeNotification, takeServerRequest } from './codex-router'

/** Счёт процессов: id вопроса в окне - `codex-<эпоха>-<rpc id>`, rpc id заново в каждом. */
let epochs = 0

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const textItem = (text: string) => ({ type: 'text', text, text_elements: [] })

/** Вызовы, которые начинают ход: их сбой - ход не начался, вкладка свободна. */
const TURN_METHODS = new Set(['turn/start', 'thread/compact/start', 'review/start'])

/** Сжатие и ревью - вызов Codex: метод и параметры. Ревью без слов - незакоммиченные правки. */
const threadCommand = (
  threadId: string,
  command: Extract<CodexCommand, { kind: 'compact' | 'review' }>,
): [string, Record<string, unknown>] =>
  command.kind === 'compact'
    ? ['thread/compact/start', { threadId }]
    : [
        'review/start',
        {
          threadId,
          delivery: 'inline',
          target: command.instructions
            ? { type: 'custom', instructions: command.instructions }
            : { type: 'uncommittedChanges' },
        },
      ]

/**
 * Ввод хода, как его берёт `turn/start`: текст, картинки data URL и заметка о редакторе
 * последним элементом - отдельно от слов человека.
 */
const inputOf = (
  text: string,
  message: Outgoing,
  editor: EditorRef | null,
  voice: VoiceOutgoing | null,
) => [
  ...(text ? [textItem(text)] : []),
  ...message.images.map((image) => ({
    type: 'image',
    url: `data:${image.mediaType};base64,${image.data}`,
  })),
  ...(voice ? [textItem(voiceNote(voice.lang, voice.heard))] : []),
  ...(editor ? [textItem(editorNote(editor))] : []),
]

/**
 * Живая сессия разговора у Codex (ADR 0083): процесс `codex app-server` и поток разговора
 * в нём. Сообщение - `turn/start` (посреди хода - `turn/steer`), вопросы - ответы на запросы
 * сервера, остановка - `turn/interrupt`. Режим, модель и усилие едут на каждом ходе: смена
 * посреди разговора - без перезапуска.
 */
export class CodexSession implements AgentSession {
  readonly epoch = (epochs += 1)
  threadId = ''
  /** Идущий ход: его останавливают и в него подмешивают сообщение посреди хода. */
  turnId = ''
  /** Навыки папки проекта (`skills/list`): «/имя» уходит Codex элементом `skill`. */
  skills: readonly CodexSkill[] = []
  /** Сообщение, которым начнётся ход, - в журнал ходов, когда Codex назовёт ход. */
  startingMessage = ''
  /** План, предложенный в идущем ходе режима плана: в конце хода он станет вопросом. */
  proposedPlan: ProposedPlan | null = null
  /** Модель и усилие по умолчанию из настроек Codex для проекта - на «по умолчанию» вкладки. */
  defaults: CodexChoice = { model: null, effort: null }
  /** Уровень обслуживания, которым ответил Codex, и просьба, которую нёс последний запрос. */
  tier: string | null = null
  tierSent: boolean | undefined = undefined
  /** Свои папки для записи и сеть человека из тех же настроек - в песочницу хода. */
  workspace: CodexWorkspace | undefined = undefined

  constructor(
    readonly runtime: ConversationRuntime,
    readonly server: AppServerProcess,
  ) {}

  get isAlive(): boolean {
    return this.server.isAlive
  }

  get isStopping(): boolean {
    return this.server.isStopping
  }

  /** Своя ли ещё сессия у разговора: заменённая поток в разговор не несёт. */
  get isCurrent(): boolean {
    return this.runtime.session === this
  }

  /**
   * Поток разговора: продолжить прошлый (`thread/resume`), ответвить форк от источника по его
   * точку (`thread/fork` - сессией самой вкладки: у потока один писатель) или начать новый
   * (`thread/start`); id нового потока - разговору, по нему он продолжится после перезапуска.
   */
  async begin(): Promise<void> {
    const { meta } = this.runtime
    const policy = policyFor(meta.permissionMode)
    const common = {
      cwd: meta.projectPath,
      model: meta.model,
      approvalPolicy: policy.approvalPolicy,
      sandbox: policy.sandbox,
      ...tierField(meta.fastMode),
    }
    const { fork } = meta
    const reply = meta.sessionId
      ? await this.server.request('thread/resume', {
          threadId: meta.sessionId,
          ...common,
          excludeTurns: true,
          // Поток прогона IDE, открытый чатом: указания его роли заменяются снятием роли.
          ...(releasedBriefing(meta.sessionId) && {
            developerInstructions: releasedBriefing(meta.sessionId),
          }),
        })
      : fork?.at
        ? await this.server.request('thread/fork', {
            threadId: fork.sourceSessionId,
            lastTurnId: fork.at,
            ...common,
            excludeTurns: true,
          })
        : await this.server.request('thread/start', common)
    const thread = isRecord(reply) && isRecord(reply['thread']) ? reply['thread'] : null
    const threadId = thread && typeof thread['id'] === 'string' ? thread['id'] : meta.sessionId

    if (!threadId) throw new Error('codex app-server: поток разговора без id')

    this.threadId = threadId
    if (threadId !== meta.sessionId) this.runtime.update({ sessionId: threadId })
    this.tier = tierOf(reply)
    this.tierSent = meta.fastMode
    // Не прочлись настройки - «по умолчанию» берётся из каталога, ход это не держит.
    const config = await this.server
      .request('config/read', { cwd: meta.projectPath })
      .catch(() => undefined)

    if (config !== undefined) {
      this.defaults = defaultsFromConfig(config)
      this.workspace = workspaceFromConfig(config)
    }
    // Навыки - командами «/» проекта; не прочлись - подсказка просто без них.
    this.skills = skillsFromList(
      await this.server.request('skills/list', { cwds: [meta.projectPath] }).catch(() => null),
    )
    codexOf(this.runtime).host.onCommands(meta.projectPath, skillCommands(this.skills))
    this.reportFast()
  }

  /** Что с быстрым режимом сейчас - разговору и, если не включился, строкой в ленту. */
  reportFast(): void {
    const { meta } = this.runtime
    const { host } = codexOf(this.runtime)
    const { model } = choiceOf(meta, this.defaults, host.model)
    const facts = { asked: meta.fastMode, sent: this.tierSent, tier: this.tier }

    noteFastReport(this.runtime, fastReportOf({ ...facts, modelFast: host.model(model)?.fast }))
  }

  send(message: Outgoing, steering: boolean): void {
    const { runtime } = this
    const { feed, shells } = codexOf(runtime)
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

    // Прогон IDE, открытый чатом: рамка о снятой роли - перед первым словом человека.
    const frame = isSlashCommand(text) ? '' : takeReleasedFrame(this.threadId)
    const shell = [frame, isSlashCommand(text) ? '' : shells.takeContext()]
      .filter(Boolean)
      .join('\n\n')
    const command = steering ? null : commandOf(text, this.skills)

    // Сжатие и ревью - свои вызовы Codex, а не сообщение модели: ход они начинают сами.
    if (command?.kind === 'compact' || command?.kind === 'review') {
      this.startingMessage = id
      if (command.kind === 'compact') feed.builder.compactRequested()

      return this.call(...threadCommand(this.threadId, command))
    }

    const input =
      command?.kind === 'skill'
        ? [
            { type: 'skill', name: command.skill.name, path: command.skill.path },
            ...inputOf([shell, command.rest].filter(Boolean).join('\n\n'), message, editor, voice),
          ]
        : inputOf([shell, text].filter(Boolean).join('\n\n'), message, editor, voice)

    if (steering && this.turnId) {
      this.call('turn/steer', {
        threadId: this.threadId,
        input,
        expectedTurnId: this.turnId,
        clientUserMessageId: id,
      })

      return
    }

    const { meta } = runtime
    const policy = policyFor(meta.permissionMode, this.workspace)

    this.startingMessage = id
    this.tierSent = meta.fastMode

    const { model, effort } = choiceOf(meta, this.defaults, codexOf(runtime).host.model)

    this.call('turn/start', {
      threadId: this.threadId,
      input,
      clientUserMessageId: id,
      approvalPolicy: policy.approvalPolicy,
      sandboxPolicy: policy.sandboxPolicy,
      model,
      effort,
      summary: 'auto',
      ...tierField(meta.fastMode),
      // Режим совместной работы Codex тоже держит на следующие ходы: выход из плана едет
      // явным «default», иначе после одобрения плана Codex так и планировал бы дальше.
      ...(model && {
        collaborationMode: {
          mode: policy.plan ? 'plan' : 'default',
          settings: { model, reasoning_effort: effort, developer_instructions: null },
        },
      }),
    })
  }

  /** Человек ответил в чат, пока ход стоял на вопросе: сообщение посреди хода, вопросу - отказ. */
  answerInChat(held: HeldRequest, message: Outgoing): void {
    this.send(message, this.runtime.turnActive)
    this.dismiss(held)
  }

  answer(held: HeldRequest, response: RequestResponse): void {
    if (isPlanHeld(held)) decidePlan(this.runtime, response)
    else if (isCodexHeld(held)) this.server.respond(held.rpcId, answerFor(held, response))
  }

  /** Снятый вопрос сервера - отказом; план снимается молча: серверу о нём ответить нечего. */
  dismiss(held: HeldRequest): void {
    if (isCodexHeld(held)) this.server.respond(held.rpcId, declineFor(held))
  }

  async interrupt(): Promise<void> {
    if (this.turnId)
      await this.server.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId })
  }

  stop(): Promise<void> {
    return this.server.stop()
  }

  kill(): void {
    this.server.kill()
  }

  /** Уведомление сервера - в ленту и разговор; заменённая сессия молчит. */
  handleNotification(method: string, params: unknown): void {
    if (this.isCurrent) routeNotification(this, method, params)
  }

  handleServerRequest(id: RpcId, method: string, params: unknown): void {
    if (this.isCurrent) takeServerRequest(this, id, method, params)
    else this.server.respondError(id, -32_000, 'Session replaced')
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

  /**
   * Запрос хода. Отказ сервера (не вошёл, модель недоступна) - ход не начался: ошибка
   * строкой, вкладка свободна, очередь ждёт человека.
   */
  private call(method: string, params: Record<string, unknown>) {
    this.server.request(method, params).catch((error: unknown) => {
      if (!this.isCurrent) return

      const { runtime } = this
      const { feed } = codexOf(runtime)

      feed.builder.addNotice('cli-error', error instanceof Error ? error.message : String(error))
      feed.flush()

      if (TURN_METHODS.has(method)) {
        runtime.settleTurn({ interrupted: false, isError: true, usage: runtime.meta.usage })
        runtime.host.onCall(runtime.meta.id, 'error')
        runtime.afterTurn(false)
      }
    })
  }
}

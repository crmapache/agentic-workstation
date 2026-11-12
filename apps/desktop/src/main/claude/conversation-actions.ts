import type { ClaudeState, RequestResponse, ConversationOptions } from '@shared/claude'
import type { FleetTranscript, ConversationFeed } from '@shared/claude-feed'
import type { RewindScope, RewindOutcome, RewindPreview } from '@shared/claude-rewind'

import type { ClaudeService } from './claude-service'
import type { Outgoing } from './conversation/outbox'
import { answerReopened } from './conversation/replay-facts'
import { rewind, previewRewind } from './conversation/rewind'
import { loadFleetTranscript } from './feed/fleet-files'
import { findTranscript } from './history/transcript-paths'
import { readTranscriptImage } from './images/transcript-images'

/**
 * Действия окна над одним разговором: сообщения и очередь, вопросы CLI, настройки,
 * откат, команды «!», файлы хода, картинки. Сервис держит сами разговоры и их
 * состояние, здесь - «найти разговор и попросить его». Ответ на изменение - состояние
 * целиком (ADR 0003).
 */
export class ConversationActions {
  constructor(private readonly service: ClaudeService) {}

  async send(conversationId: string, message: Outgoing): Promise<ClaudeState> {
    await this.service.runtime(conversationId).send(message)

    return this.service.getState()
  }

  /** before - сосед, перед которым встать: сообщение вынимали из очереди поправить. */
  async enqueue(
    conversationId: string,
    message: Outgoing,
    before: string | null = null,
  ): Promise<ClaudeState> {
    await this.service.runtime(conversationId).enqueue(message, before)

    return this.service.getState()
  }

  removeQueued(conversationId: string, queuedId: string): ClaudeState {
    this.service.runtime(conversationId).removeQueued(queuedId)

    return this.service.getState()
  }

  /** Переставить отложенное на место toIndex: окно - перетаскиванием, телефон - кнопками. */
  moveQueued(conversationId: string, queuedId: string, toIndex: number): ClaudeState {
    this.service.runtime(conversationId).outbox.move(queuedId, toIndex)

    return this.service.getState()
  }

  async sendQueued(conversationId: string, queuedId: string): Promise<ClaudeState> {
    await this.service.runtime(conversationId).sendQueued(queuedId)

    return this.service.getState()
  }

  interrupt(conversationId: string): ClaudeState {
    this.service.runtime(conversationId).interrupt()
    // Stop человека - его «нет» и продолжению панели: слова снимаются, ожидание лимита - тихое.
    this.service.panel.carryOn.cancel(conversationId)

    return this.service.getState()
  }

  forceStop(conversationId: string): ClaudeState {
    this.service.runtime(conversationId).forceStop()

    return this.service.getState()
  }

  respond(conversationId: string, requestId: string, response: RequestResponse): ClaudeState {
    const runtime = this.service.runtime(conversationId)

    // Оживший вопрос из истории: спросившего вызова нет - ответ уходит сообщением.
    if (!answerReopened(runtime, requestId, response)) runtime.respond(requestId, response)

    return this.service.getState()
  }

  /** /status: строка SESSION в ленте - id разговора, его и продолжают в терминале. */
  async showSessionInfo(conversationId: string): Promise<ClaudeState> {
    const runtime = this.service.runtime(conversationId)

    await runtime.loadFeed()
    runtime.feed.builder.addNotice('session', runtime.meta.sessionId)
    runtime.feed.flush()

    return this.service.getState()
  }

  /** Страница ранней истории («load earlier messages»): лента целиком. */
  async loadEarlier(conversationId: string): Promise<ConversationFeed> {
    const runtime = this.service.runtime(conversationId)

    await runtime.loadFeed()

    return runtime.feed.loadEarlier()
  }

  setOptions(conversationId: string, options: ConversationOptions): ClaudeState {
    const runtime = this.service.runtime(conversationId)

    // Судьба выбора модели, быстрый режим без модели, которая его умеет, память аккаунта.
    runtime.setOptions(this.service.panel.options(runtime, options))

    return this.service.getState()
  }

  runShell(conversationId: string, command: string): ClaudeState {
    const runtime = this.service.runtime(conversationId)

    runtime.runShell(command).catch((error: unknown) => {
      console.warn('[claude] команда «!» не запустилась:', error)
    })

    return this.service.getState()
  }

  async revertChanges(
    conversationId: string,
    turnId: string,
    path: string | null,
    restore: boolean,
  ): Promise<ClaudeState> {
    await this.service.runtime(conversationId).turnRevert.apply(turnId, path, restore)

    return this.service.getState()
  }

  stopShell(conversationId: string, runId: string): ClaudeState {
    this.service.runtime(conversationId).stopShell(runId)

    return this.service.getState()
  }

  /**
   * Остановить задачу CLI (субагент, фоновую команду), не трогая ход. Уже кончившуюся CLI
   * останавливает молча; о конце скажет своим уведомлением. Процесса нет - и задачи нет.
   */
  stopTask(conversationId: string, taskId: string): ClaudeState {
    this.service
      .runtime(conversationId)
      .process?.control({ subtype: 'stop_task', task_id: taskId })
      .catch((error: unknown) => console.warn('[claude] задача не остановилась:', taskId, error))

    return this.service.getState()
  }

  /** Разговор агента флота с диска: в папке этого разговора, потом источника форка и прочих. */
  readFleetAgent(conversationId: string, agentId: string): Promise<FleetTranscript> {
    const { projectPath, sessionId, fork } = this.service.runtime(conversationId).meta
    const sessions = fork ? [sessionId, fork.sourceSessionId] : [sessionId]

    return loadFleetTranscript(projectPath, sessions, agentId)
  }

  /**
   * Картинка сообщения целиком - из транскрипта разговора, у нерождённого форка - из
   * источника (там его унаследованные сообщения).
   */
  async getImage(conversationId: string, messageId: string, index: number): Promise<string | null> {
    const { projectPath, sessionId, fork } = this.service.runtime(conversationId).meta
    const file =
      (await findTranscript(projectPath, sessionId)) ??
      (fork ? await findTranscript(projectPath, fork.sourceSessionId) : null)

    return file ? readTranscriptImage(file, messageId, index) : null
  }

  previewRewind(conversationId: string, messageId: string): Promise<RewindPreview> {
    return previewRewind(this.service.runtime(conversationId), messageId)
  }

  async rewind(
    conversationId: string,
    messageId: string,
    scope: RewindScope,
  ): Promise<{ state: ClaudeState; outcome: RewindOutcome }> {
    const outcome = await rewind(this.service.runtime(conversationId), messageId, scope)

    return { state: this.service.getState(), outcome }
  }
}

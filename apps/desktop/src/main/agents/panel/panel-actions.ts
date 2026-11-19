import type { AgentPanelState, RequestResponse, ConversationOptions } from '@shared/conversation'
import type { FeedItem, ConversationFeed } from '@shared/conversation-feed'
import type { RewindScope, RewindOutcome, RewindPreview } from '@shared/rewind'

import type { ConversationRuntime } from '../conversation/conversation-runtime'
import type { Outgoing } from '../conversation/outbox'

/**
 * Своё провайдера у действий над разговором (ADR 0083): то, что знает только его CLI и
 * журнал - откат файлов и разговора, картинки из журнала, остановка задачи, поправка выбора.
 */
export type ConversationOps = {
  /** Человек нажал Stop: служебное провайдера снимает то, что ждало (у Claude - продолжение). */
  stopped: (conversationId: string) => void
  /** Оживший из истории вопрос: спросившего вызова нет - драйвер отвечает сам. true - ответил. */
  answerReopened: (
    runtime: ConversationRuntime,
    requestId: string,
    response: RequestResponse,
  ) => boolean
  /** Выбор модели, усилия, режима с поправкой провайдера (модель аккаунта, быстрый режим). */
  options: (runtime: ConversationRuntime, options: ConversationOptions) => ConversationOptions
  /** Строка SESSION в ленте: id разговора и как продолжить его в терминале. */
  sessionInfo: (runtime: ConversationRuntime) => void
  revertChanges: (
    runtime: ConversationRuntime,
    turnId: string,
    path: string | null,
    restore: boolean,
  ) => Promise<void>
  /** Остановить задачу CLI (субагент, фоновую команду), не трогая ход. */
  stopTask: (runtime: ConversationRuntime, taskId: string) => void
  /** Картинка сообщения целиком - из журнала разговора (data URL); null - нет. */
  getImage: (
    runtime: ConversationRuntime,
    messageId: string,
    index: number,
  ) => Promise<string | null>
  previewRewind: (runtime: ConversationRuntime, messageId: string) => Promise<RewindPreview>
  rewind: (
    runtime: ConversationRuntime,
    messageId: string,
    scope: RewindScope,
  ) => Promise<RewindOutcome>
}

/** Что действиям нужно от панели: разговор по id и её состояние для ответа. */
export type ActionsPanel = {
  runtime: (conversationId: string) => ConversationRuntime
  getState: () => AgentPanelState
}

/**
 * Действия окна над одним разговором: сообщения и очередь, вопросы CLI, настройки,
 * откат, команды «!», файлы хода, картинки. Панель держит сами разговоры и их состояние,
 * здесь - «найти разговор и попросить его». Ответ на изменение - состояние целиком
 * (ADR 0003). Своё провайдера - через ConversationOps.
 */
export class PanelActions {
  /** ops - функцией: панель-наследник собирает их после базового конструктора. */
  constructor(
    private readonly panel: ActionsPanel,
    private readonly opsOf: () => ConversationOps,
  ) {}

  private get ops(): ConversationOps {
    return this.opsOf()
  }

  async send(conversationId: string, message: Outgoing): Promise<AgentPanelState> {
    await this.panel.runtime(conversationId).send(message)

    return this.panel.getState()
  }

  /** before - сосед, перед которым встать: сообщение вынимали из очереди поправить. */
  async enqueue(
    conversationId: string,
    message: Outgoing,
    before: string | null = null,
  ): Promise<AgentPanelState> {
    await this.panel.runtime(conversationId).enqueue(message, before)

    return this.panel.getState()
  }

  removeQueued(conversationId: string, queuedId: string): AgentPanelState {
    this.panel.runtime(conversationId).removeQueued(queuedId)

    return this.panel.getState()
  }

  /** Переставить отложенное на место toIndex: окно - перетаскиванием, телефон - кнопками. */
  moveQueued(conversationId: string, queuedId: string, toIndex: number): AgentPanelState {
    this.panel.runtime(conversationId).outbox.move(queuedId, toIndex)

    return this.panel.getState()
  }

  async sendQueued(conversationId: string, queuedId: string): Promise<AgentPanelState> {
    await this.panel.runtime(conversationId).sendQueued(queuedId)

    return this.panel.getState()
  }

  interrupt(conversationId: string): AgentPanelState {
    this.panel.runtime(conversationId).interrupt()
    // Stop человека - его «нет» и служебному провайдера (у Claude - продолжению после лимита).
    this.ops.stopped(conversationId)

    return this.panel.getState()
  }

  forceStop(conversationId: string): AgentPanelState {
    this.panel.runtime(conversationId).forceStop()

    return this.panel.getState()
  }

  respond(conversationId: string, requestId: string, response: RequestResponse): AgentPanelState {
    const runtime = this.panel.runtime(conversationId)

    // Оживший вопрос из истории: спросившего вызова нет - ответ уходит сообщением.
    if (!this.ops.answerReopened(runtime, requestId, response)) {
      runtime.respond(requestId, response)
    }

    return this.panel.getState()
  }

  /** /status: строка SESSION в ленте - id разговора, его и продолжают в терминале. */
  async showSessionInfo(conversationId: string): Promise<AgentPanelState> {
    const runtime = this.panel.runtime(conversationId)

    await runtime.loadFeed()
    this.ops.sessionInfo(runtime)

    return this.panel.getState()
  }

  /** Страница ранней истории («load earlier messages»): лента целиком. */
  async loadEarlier(conversationId: string): Promise<ConversationFeed> {
    const runtime = this.panel.runtime(conversationId)

    await runtime.loadFeed()

    return runtime.feed.loadEarlier()
  }

  /** Страницы выше - до элемента ленты (прыжок к закреплённому): лента целиком. */
  async loadThrough(conversationId: string, itemId: string): Promise<ConversationFeed> {
    const runtime = this.panel.runtime(conversationId)

    await runtime.loadFeed()

    return runtime.feed.loadThrough(itemId)
  }

  /** Элементы ленты по id, загруженные и выше загруженного (полка закреплённых). */
  async feedItems(conversationId: string, itemIds: readonly string[]): Promise<FeedItem[] | null> {
    const runtime = this.panel.runtime(conversationId)

    await runtime.loadFeed()

    return runtime.feed.itemsById(itemIds)
  }

  setOptions(conversationId: string, options: ConversationOptions): AgentPanelState {
    const runtime = this.panel.runtime(conversationId)

    runtime.setOptions(this.ops.options(runtime, options))

    return this.panel.getState()
  }

  runShell(conversationId: string, command: string): AgentPanelState {
    const runtime = this.panel.runtime(conversationId)

    runtime.runShell(command).catch((error: unknown) => {
      console.warn('[agents] команда «!» не запустилась:', error)
    })

    return this.panel.getState()
  }

  async revertChanges(
    conversationId: string,
    turnId: string,
    path: string | null,
    restore: boolean,
  ): Promise<AgentPanelState> {
    await this.ops.revertChanges(this.panel.runtime(conversationId), turnId, path, restore)

    return this.panel.getState()
  }

  stopShell(conversationId: string, runId: string): AgentPanelState {
    this.panel.runtime(conversationId).stopShell(runId)

    return this.panel.getState()
  }

  /**
   * Остановить задачу CLI (субагент, фоновую команду), не трогая ход. Уже кончившуюся CLI
   * останавливает молча; о конце скажет своим уведомлением. Сессии нет - и задачи нет.
   */
  stopTask(conversationId: string, taskId: string): AgentPanelState {
    this.ops.stopTask(this.panel.runtime(conversationId), taskId)

    return this.panel.getState()
  }

  /** Картинка сообщения целиком - из журнала разговора, у нерождённого форка - из источника. */
  getImage(conversationId: string, messageId: string, index: number): Promise<string | null> {
    return this.ops.getImage(this.panel.runtime(conversationId), messageId, index)
  }

  previewRewind(conversationId: string, messageId: string): Promise<RewindPreview> {
    return this.ops.previewRewind(this.panel.runtime(conversationId), messageId)
  }

  async rewind(
    conversationId: string,
    messageId: string,
    scope: RewindScope,
  ): Promise<{ state: AgentPanelState; outcome: RewindOutcome }> {
    const outcome = await this.ops.rewind(this.panel.runtime(conversationId), messageId, scope)

    return { state: this.panel.getState(), outcome }
  }
}

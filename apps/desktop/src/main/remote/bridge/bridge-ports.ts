import type {
  ClaudeState,
  HistoryEntry,
  ImageAttachment,
  RequestResponse,
  ConversationOptions,
} from '@shared/claude'
import type { ConversationFeed } from '@shared/claude-feed'
import type { ProviderInfo } from '@shared/providers'
import type {
  QueueAction,
  ScenarioQueuesView,
  ScenarioStartOutcome,
  ScenarioStartRequest,
} from '@shared/scenario-queues'
import type { RunState, ScenarioRun, RunQuestionRef } from '@shared/scenario-runs'
import type {
  RunControlRefusal,
  ScenarioRunControl,
  ScenarioShelvesView,
} from '@shared/scenario-view'
import type { ScenarioCode } from '@shared/scenarios'
import type { WorkspaceState } from '@shared/workspace'

/**
 * Что мост Remote Control берёт у IDE - узко, только публичные действия сервисов, которыми
 * пользуется и окно. Мост не знает ни процессов CLI, ни движка сценариев; тест подставляет
 * подделки этих портов.
 */

/** Разговоры провайдера. Сейчас один - Claude Code (ClaudeService), провайдер в каждой записи. */
export type ConversationsPort = {
  getState: () => ClaudeState
  getFeed: (conversationId: string) => Promise<ConversationFeed>
  send: (
    conversationId: string,
    message: { text: string; images: ImageAttachment[] },
  ) => Promise<unknown>
  respond: (conversationId: string, requestId: string, response: RequestResponse) => unknown
  interrupt: (conversationId: string) => unknown
  /**
   * Новый разговор в проекте с выбором сразу - до того, как поднимется процесс. Ответ - id
   * созданного: не догадка по разнице списков, которую сбил бы разговор, открытый в окне в
   * ту же секунду.
   */
  newConversation: (projectPath: string, options: ConversationOptions) => Promise<string>
  /** Закрыть разговор, который не вышел таким, как просили (откат неудачного создания). */
  close: (conversationId: string) => Promise<unknown>
  setOptions: (conversationId: string, options: ConversationOptions) => unknown
  rename: (conversationId: string, title: string) => Promise<unknown>
  providers: () => Promise<ProviderInfo[]>
  /** Прошлые разговоры проекта (claude:listHistory). */
  history: (projectPath: string) => Promise<HistoryEntry[]>
  /**
   * Открыть прошлый разговор вкладкой (claude:openHistory). Ответ - id вкладки; null - такого
   * разговора у проекта нет (транскрипт пропал), а не исключение посреди команды.
   */
  openHistory: (projectPath: string, sessionId: string) => Promise<string | null>
  /** Страница ранней истории в ленту IDE (claude:loadEarlier); ответ - лента целиком. */
  loadEarlier: (conversationId: string) => Promise<ConversationFeed>
  /** Картинка сообщения целиком, data URL (claude:getImage); null - её нет. */
  image: (conversationId: string, messageId: string, index: number) => Promise<string | null>
}

/**
 * Картинки для телефона: уменьшить, чтобы ответ влез в кадр. Это Electron (nativeImage), а мост
 * его не знает - тест подставляет свою подделку.
 */
export type PicturesPort = {
  /** JPEG не больше edge по длинной стороне, data URL; картинку не прочесть - null. */
  shrink: (dataUrl: string, edge: number, quality: number) => string | null
}

/** Сценарии на уровне IDE (ScenarioService, ADR 0039). */
export type ScenariosPort = {
  queuesView: () => ScenarioQueuesView
  start: (request: ScenarioStartRequest) => Promise<ScenarioStartOutcome>
  act: (queueId: string, action: QueueAction) => Promise<ScenarioCode | null>
  run: (projectPath: string, runId: string) => Promise<ScenarioRun | null>
  /** seen - для какого состояния нарисована кнопка на телефоне. */
  control: (
    projectPath: string,
    runId: string,
    action: ScenarioRunControl,
    seen: RunState,
  ) => RunControlRefusal | null
  /** false - вопроса, который видел телефон (asked), уже нет. */
  answer: (
    projectPath: string,
    runId: string,
    allow: boolean,
    text: string,
    asked: RunQuestionRef,
  ) => boolean
  tell: (projectPath: string, runId: string, text: string, images: ImageAttachment[]) => boolean
  carryOn: (runId: string) => Promise<ScenarioCode | null>
  shelves: (projectPath: string) => Promise<ScenarioShelvesView>
}

export type WorkspacePort = { getState: () => WorkspaceState }

export type BridgePorts = {
  conversations: ConversationsPort
  scenarios: ScenariosPort
  workspace: WorkspacePort
  pictures: PicturesPort
}

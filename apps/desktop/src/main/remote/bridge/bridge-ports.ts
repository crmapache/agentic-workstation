import type {
  ClaudeState,
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
}

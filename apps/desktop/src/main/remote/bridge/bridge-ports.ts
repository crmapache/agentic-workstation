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
import type { ScenarioRun } from '@shared/scenario-runs'
import type { ScenarioRunControl, ScenarioShelvesView } from '@shared/scenario-view'
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
  /** Новый разговор в проекте; ответ - состояние, где он уже есть. */
  newConversation: (projectPath: string) => Promise<ClaudeState>
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
  control: (projectPath: string, runId: string, action: ScenarioRunControl) => void
  answer: (projectPath: string, runId: string, allow: boolean, text: string) => void
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

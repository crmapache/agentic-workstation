import type { ImageAttachment } from '../claude'
import type { ProviderId, ProviderInfo } from '../providers'
import type {
  QueueAction,
  QueueTarget,
  WorktreeFacts,
  WorktreeAction,
  ScenarioQueuesView,
  ScenarioStartOutcome,
} from '../scenario-queues'
import type { ScenarioRun } from '../scenario-runs'
import type {
  StepLogPage,
  ScenarioRunChanged,
  ScenarioRunControl,
  ScenarioHourRequest,
  ScenarioSaveOutcome,
  ScenarioShelvesView,
  ScenarioDraftOutcome,
  ScenarioShelvesChanged,
} from '../scenario-view'
import type { Scenario, ScenarioScope, ScenarioOutcome } from '../scenarios'

type ProjectRequest = { projectId: string }
type ShelfItem = ProjectRequest & { id: string; scope: ScenarioScope }

/**
 * Где искать прогон: у очереди (доска очередей - очереди всех проектов IDE, и закрытых вкладок
 * тоже: очереди живут на уровне IDE, ADR 0039) или в истории открытого проекта. Путь проекта
 * окно не называет - его знает главный процесс по своей очереди.
 */
export type RunPlace = { queueId: string } | { projectId: string }
type RunRequest = { place: RunPlace; runId: string }

/**
 * Часть контракта (contract.ts) про сценарии на уровне IDE (ADR 0039): полки, очереди,
 * прогоны, расписание. Правила - .claude/rules/ipc-contract.md.
 */
export type ScenariosInvokeContract = {
  /** Провайдеры ИИ и на месте ли они - для выбора при запуске. */
  'providers:list': { request: void; response: ProviderInfo[] }
  'scenarios:shelves': { request: ProjectRequest; response: ScenarioShelvesView }
  'scenarios:fetch': { request: ShelfItem; response: Scenario | null }
  'scenarios:save': {
    request: ProjectRequest & { scenario: Scenario; scope: ScenarioScope }
    response: ScenarioSaveOutcome
  }
  'scenarios:delete': { request: ShelfItem; response: ScenarioOutcome }
  'scenarios:duplicate': { request: ShelfItem; response: ScenarioOutcome }
  /** Перенести на полку to перед сценарием before (пусто - в конец). */
  'scenarios:place': {
    request: ProjectRequest & {
      id: string
      from: ScenarioScope
      to: ScenarioScope
      before: string
    }
    response: ScenarioOutcome
  }
  'scenarios:draft': {
    request: ProjectRequest & { draftId: string; description: string; scope: ScenarioScope }
    response: ScenarioDraftOutcome
  }
  'scenarios:cancelDraft': { request: { draftId: string }; response: void }
  /** Открытые очереди всех проектов и идущие прогоны. */
  'scenarios:queues': { request: void; response: ScenarioQueuesView }
  'scenarios:start': {
    request: ProjectRequest & {
      scenarioId: string
      scope: ScenarioScope
      inputs: Record<string, string>
      provider: ProviderId
      target: QueueTarget
      afterSuccess: boolean
    }
    response: ScenarioStartOutcome
  }
  'scenarios:queue': {
    request: { queueId: string; action: QueueAction }
    response: ScenarioOutcome
  }
  'scenarios:worktreeFacts': { request: { queueId: string }; response: WorktreeFacts | null }
  'scenarios:worktree': {
    request: { queueId: string; action: WorktreeAction }
    response: ScenarioOutcome
  }
  'scenarios:run': { request: RunRequest; response: ScenarioRun | null }
  'scenarios:control': { request: RunRequest & { action: ScenarioRunControl }; response: void }
  /** Подхватить остановленный прогон элемента очереди с места. */
  'scenarios:carryOn': { request: { runId: string }; response: ScenarioOutcome }
  'scenarios:answer': { request: RunRequest & { allow: boolean; text: string }; response: void }
  /** Слова человека голове прогона. */
  'scenarios:tell': {
    request: RunRequest & { text: string; images: ImageAttachment[] }
    response: ScenarioOutcome
  }
  /** Журнал шага (key - шаг, 'head' - голова) - разговор той же лентой, что в панели. */
  'scenarios:stepLog': {
    request: RunRequest & { key: string; earlier: boolean }
    response: StepLogPage
  }
  /** Продолжить разговор головы законченного прогона обычной вкладкой панели провайдера. */
  'scenarios:openChat': { request: RunRequest; response: ScenarioOutcome }
  'scenarios:deleteRun': { request: ProjectRequest & { runId: string }; response: ScenarioOutcome }
  'scenarios:starRun': {
    request: ProjectRequest & { runId: string; starred: boolean }
    response: ScenarioOutcome
  }
  'scenarios:schedule': {
    request: ProjectRequest & { hour: ScenarioHourRequest }
    response: ScenarioOutcome
  }
  'scenarios:unschedule': {
    request: ProjectRequest & { scheduleId: string }
    response: ScenarioOutcome
  }
}

export type ScenariosEventContract = {
  'scenarios:queues': ScenarioQueuesView
  'scenarios:shelves': ScenarioShelvesChanged
  'scenarios:run': ScenarioRunChanged
}

export const SCENARIOS_CHANNELS = {
  'providers:list': true,
  'scenarios:shelves': true,
  'scenarios:fetch': true,
  'scenarios:save': true,
  'scenarios:delete': true,
  'scenarios:duplicate': true,
  'scenarios:place': true,
  'scenarios:draft': true,
  'scenarios:cancelDraft': true,
  'scenarios:queues': true,
  'scenarios:start': true,
  'scenarios:queue': true,
  'scenarios:worktreeFacts': true,
  'scenarios:worktree': true,
  'scenarios:run': true,
  'scenarios:control': true,
  'scenarios:carryOn': true,
  'scenarios:answer': true,
  'scenarios:tell': true,
  'scenarios:stepLog': true,
  'scenarios:openChat': true,
  'scenarios:deleteRun': true,
  'scenarios:starRun': true,
  'scenarios:schedule': true,
  'scenarios:unschedule': true,
} satisfies Record<keyof ScenariosInvokeContract, true>

export const SCENARIOS_EVENTS = {
  'scenarios:queues': true,
  'scenarios:shelves': true,
  'scenarios:run': true,
} satisfies Record<keyof ScenariosEventContract, true>

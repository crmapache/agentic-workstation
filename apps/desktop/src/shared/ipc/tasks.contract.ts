import type { StepLogPage } from '../scenario-view'
import type { TaskRun, TaskDraft, TaskSaved, TasksState, TaskOutcome, TaskStarted } from '../tasks'

type RunRequest = { runId: string }

/**
 * Часть контракта (contract.ts) про задания по расписанию (ADR 0069): задания уровня IDE,
 * прогоны, их отчёты и журналы. Правила - .claude/rules/ipc-contract.md.
 */
export type TasksInvokeContract = {
  'tasks:get': { request: void; response: TasksState }
  /** Новое задание или правка; папку главный процесс сверяет со своими проектами. */
  'tasks:save': { request: { task: TaskDraft }; response: TaskSaved }
  /** Убрать задание; его прогоны остаются в истории. Идущий прогон останавливается. */
  'tasks:remove': { request: { taskId: string }; response: TaskOutcome }
  'tasks:setEnabled': { request: { taskId: string; enabled: boolean }; response: TaskOutcome }
  /** Запустить сейчас, вне расписания. */
  'tasks:runNow': { request: { taskId: string }; response: TaskStarted }
  'tasks:stop': { request: RunRequest; response: TaskOutcome }
  /** Свои слова прогону: идущему - следующим сообщением, законченному - продолжение разговора. */
  'tasks:tell': { request: RunRequest & { text: string }; response: TaskOutcome }
  /** Прогон целиком, с отчётом; null - его нет. */
  'tasks:run': { request: RunRequest; response: TaskRun | null }
  /** Журнал прогона - лентой разговора, конец вперёд; earlier - страница раньше. */
  'tasks:log': { request: RunRequest & { earlier: boolean }; response: StepLogPage }
  /** Разговор прогона - обычной вкладкой панели его проекта (проект откроется). */
  'tasks:openChat': { request: RunRequest; response: TaskOutcome }
}

export type TasksEventContract = {
  'tasks:changed': TasksState
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const TASKS_CHANNELS = {
  'tasks:get': true,
  'tasks:save': true,
  'tasks:remove': true,
  'tasks:setEnabled': true,
  'tasks:runNow': true,
  'tasks:stop': true,
  'tasks:tell': true,
  'tasks:run': true,
  'tasks:log': true,
  'tasks:openChat': true,
} satisfies Record<keyof TasksInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const TASKS_EVENTS = {
  'tasks:changed': true,
} satisfies Record<keyof TasksEventContract, true>

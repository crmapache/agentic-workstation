import type { Scenario, ScenarioCode, ScenarioScope } from '@shared/scenarios'
import type { RunPlace } from '@shared/ipc/scenarios.contract'

/** Вкладки вида сценариев. */
export type ScenariosTab = 'library' | 'queues' | 'board' | 'schedule' | 'history'

/**
 * Окно поверх вида (ADR 0030: подробности предмета - окном по центру). Одно за раз: запуск,
 * прогон, редактор, новый сценарий, отложенный запуск, удаление worktree.
 */
export type ScenariosModal =
  | { kind: 'launch'; scenarioId?: string; scope?: ScenarioScope; queueId?: string }
  | { kind: 'run'; place: RunPlace; runId: string }
  | { kind: 'editor'; scenario: Scenario | null; scope: ScenarioScope }
  | { kind: 'author' }
  | { kind: 'schedule'; scheduleId?: string; scenarioId?: string; scope?: ScenarioScope }
  | { kind: 'worktreeRemove'; queueId: string }

/** Отказ главного процесса, который показывается уведомлением в углу окна. */
export type ScenarioNoticeState = { code: ScenarioCode; detail: string } | null

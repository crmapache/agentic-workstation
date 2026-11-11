import type { QueueAction, WorktreeAction } from '@shared/scenario-queues'
import type { ScenarioRunControl, ScenarioHourRequest } from '@shared/scenario-view'
import type { ScenarioOutcome } from '@shared/scenarios'
import type { RunPlace } from '@shared/ipc/scenarios.contract'

import { invoke } from '../../lib/ipc'
import { useScenariosStore } from './scenarios.store'

/**
 * Действия над очередями и прогонами. Новое состояние главный процесс присылает событием
 * (`scenarios:queues`, `scenarios:shelves`), поэтому ответ здесь - только «вышло ли»: отказ
 * встаёт уведомлением в углу окна с текстом по коду.
 */
export const useScenarioActions = () => {
  const fail = useScenariosStore((state) => state.fail)
  const report = async (call: Promise<ScenarioOutcome>): Promise<boolean> => {
    const outcome = await call

    if (!outcome.ok) fail(outcome.code)

    return outcome.ok
  }

  return {
    queue: (queueId: string, action: QueueAction) =>
      report(invoke('scenarios:queue', { queueId, action })),
    worktree: (queueId: string, action: WorktreeAction) =>
      report(invoke('scenarios:worktree', { queueId, action })),
    control: (place: RunPlace, runId: string, action: ScenarioRunControl) =>
      invoke('scenarios:control', { place, runId, action }),
    carryOn: (runId: string) => report(invoke('scenarios:carryOn', { runId })),
    answer: (place: RunPlace, runId: string, allow: boolean, text: string) =>
      invoke('scenarios:answer', { place, runId, allow, text }),
    deleteRun: (projectId: string, runId: string) =>
      report(invoke('scenarios:deleteRun', { projectId, runId })),
    starRun: (projectId: string, runId: string, starred: boolean) =>
      report(invoke('scenarios:starRun', { projectId, runId, starred })),
    schedule: (projectId: string, hour: ScenarioHourRequest) =>
      report(invoke('scenarios:schedule', { projectId, hour })),
    unschedule: (projectId: string, scheduleId: string) =>
      report(invoke('scenarios:unschedule', { projectId, scheduleId })),
    remove: (projectId: string, id: string, scope: string) =>
      report(invoke('scenarios:delete', { projectId, id, scope })),
    duplicate: (projectId: string, id: string, scope: string) =>
      report(invoke('scenarios:duplicate', { projectId, id, scope })),
    place: (projectId: string, id: string, from: string, to: string, before: string) =>
      report(invoke('scenarios:place', { projectId, id, from, to, before })),
  }
}

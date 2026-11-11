import { useState } from 'react'

import type { TimetableRow } from '../scenarios-hours.utils'
import { useScenarioActions } from '../scenarios.actions'
import { useScenariosStore } from '../scenarios.store'
import type { ScenariosProject } from '../ScenariosView/ScenariosView.types'
import { invoke } from '../../../lib/ipc'

/**
 * Что делают со строкой расписания. Правка открывает окно часа своими ответами (они принадлежат
 * записи), удаление - после вопроса. Run now делает сейчас то, что сделал бы час: новая очередь
 * с ответами, worktree и провайдером записи - в назначенный час никто не отвечал бы заново, и
 * сейчас незачем. Пропущенный разовый час, запущенный так, своё отслужил и уходит.
 */
export const useScheduleActions = (project: ScenariosProject) => {
  const actions = useScenarioActions()
  const open = useScenariosStore((store) => store.open)
  const fail = useScenariosStore((store) => store.fail)
  const setTab = useScenariosStore((store) => store.setTab)
  const [doomed, setDoomed] = useState<TimetableRow | null>(null)

  const runNow = async ({ schedule, missed }: TimetableRow) => {
    const outcome = await invoke('scenarios:start', {
      projectId: project.id,
      scenarioId: schedule.scenarioId,
      scope: schedule.scope,
      inputs: schedule.inputs,
      provider: schedule.provider,
      target: { kind: 'new', worktree: schedule.worktree },
      afterSuccess: true,
    })

    if (!outcome.ok) {
      fail(outcome.code, outcome.detail)

      return
    }

    if (missed && schedule.repeat === 'once') void actions.unschedule(project.id, schedule.id)

    setTab('queues')
  }

  const confirmRemove = () => {
    if (doomed) void actions.unschedule(project.id, doomed.schedule.id)

    setDoomed(null)
  }

  return {
    doomed,
    edit: ({ schedule }: TimetableRow) =>
      open({
        kind: 'schedule',
        scheduleId: schedule.id,
        scenarioId: schedule.scenarioId,
        scope: schedule.scope,
      }),
    remove: setDoomed,
    runNow: (row: TimetableRow) => void runNow(row),
    confirmRemove,
    cancelRemove: () => setDoomed(null),
    add: () => open({ kind: 'schedule' }),
  }
}

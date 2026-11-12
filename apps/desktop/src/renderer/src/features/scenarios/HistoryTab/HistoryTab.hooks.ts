import { useState } from 'react'

import type { RunSummary } from '@shared/scenario-runs'

import { useScenarioActions } from '../scenarios.actions'
import { useScenariosStore } from '../scenarios.store'
import type { ScenariosProject } from '../ScenariosView/ScenariosView.types'
import { RUNS_PAGE } from './HistoryTab.constants'

/**
 * Что делают с прошлым прогоном: открыть окном, поставить звезду, удалить после вопроса - и
 * сколько строк таблицы раскрыто. Раскрытое только растёт: новый прогон не сворачивает
 * историю под рукой.
 */
export const useHistoryActions = (project: ScenariosProject) => {
  const actions = useScenarioActions()
  const open = useScenariosStore((store) => store.open)
  const [doomed, setDoomed] = useState<RunSummary | null>(null)
  const [shown, setShown] = useState(RUNS_PAGE)

  const confirmDelete = () => {
    if (doomed) void actions.deleteRun(project.id, doomed.id)

    setDoomed(null)
  }

  return {
    doomed,
    shown,
    open: (runId: string) => open({ kind: 'run', place: { projectId: project.id }, runId }),
    star: (run: RunSummary) => void actions.starRun(project.id, run.id, !run.starred),
    remove: setDoomed,
    confirmDelete,
    cancelDelete: () => setDoomed(null),
    more: () => setShown((now) => now + RUNS_PAGE),
    fewer: () => setShown(RUNS_PAGE),
  }
}

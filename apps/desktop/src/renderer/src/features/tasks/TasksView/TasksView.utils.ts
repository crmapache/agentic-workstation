import type { TaskRunSummary } from '@shared/tasks'

import { isoDay } from '../../../lib/dates.utils'
import type { RunDay } from './TasksView.types'

/** Последний прогон задания (сводки уже новые первыми); пропущенный - тоже прогон. */
export const lastRunOf = (runs: readonly TaskRunSummary[], taskId: string) =>
  runs.find((run) => run.taskId === taskId) ?? null

/** Длительность прогона: «45 s», «3 min», «1 h 20 min». */
export const durationOf = (run: Pick<TaskRunSummary, 'startedAt' | 'endedAt'>, now: number) => {
  const seconds = Math.max(0, Math.round(((run.endedAt || now) - run.startedAt) / 1000))

  if (seconds < 60) return `${seconds} s`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`

  const minutes = Math.round(seconds / 60)

  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/**
 * Прогоны по местным дням запуска, в том же порядке: дни - как встретились (новые первыми),
 * внутри дня - как пришли. День помнит момент первого прогона - по нему пишется заголовок.
 */
export const runsByDay = (runs: readonly TaskRunSummary[]): RunDay[] => {
  const days = new Map<string, RunDay>()

  for (const run of runs) {
    const key = isoDay(run.startedAt)
    const day = days.get(key)

    if (day) day.runs.push(run)
    else days.set(key, { key, at: run.startedAt, runs: [run] })
  }

  return [...days.values()]
}

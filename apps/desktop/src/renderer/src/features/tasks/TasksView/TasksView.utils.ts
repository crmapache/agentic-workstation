import type { TaskRunSummary } from '@shared/tasks'

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

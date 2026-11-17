import type { TaskRun } from '@shared/tasks'

export type TaskRunModalProps = { runId: string }

/** Раздел окна прогона: отчёт или разговор целиком. */
export type RunSection = 'report' | 'log'

export type RunPartProps = { run: TaskRun }

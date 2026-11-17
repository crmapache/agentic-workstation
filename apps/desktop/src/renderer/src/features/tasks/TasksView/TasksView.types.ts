import type { GoalSummary } from '@shared/goals'
import type { Task, TaskRunSummary } from '@shared/tasks'

export type TaskListProps = {
  tasks: readonly Task[]
  runs: readonly TaskRunSummary[]
  goals: readonly GoalSummary[]
  now: number
}

export type TaskRowProps = {
  task: Task
  lastRun: TaskRunSummary | null
  /** Живая жизнь поручения - сводкой; у задания по расписанию и без жизни - null. */
  life: GoalSummary | null
  now: number
}

export type RunListProps = { runs: readonly TaskRunSummary[]; now: number }

export type RunRowProps = { run: TaskRunSummary; now: number }

import type { Task, TaskRunSummary } from '@shared/tasks'

/** Задания одного проекта - раздел списка. */
export type TaskGroup = { projectPath: string; name: string; tasks: Task[] }

export type TaskListProps = { groups: TaskGroup[]; runs: readonly TaskRunSummary[]; now: number }

export type TaskRowProps = { task: Task; lastRun: TaskRunSummary | null; now: number }

export type RunListProps = { runs: readonly TaskRunSummary[]; now: number }

export type RunRowProps = { run: TaskRunSummary; now: number }

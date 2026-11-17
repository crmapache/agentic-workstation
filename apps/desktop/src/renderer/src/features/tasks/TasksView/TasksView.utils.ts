import type { Task, TaskRunSummary } from '@shared/tasks'
import type { WorkspaceState } from '@shared/workspace'

import { baseName } from '../../../lib/path.utils'
import type { TaskGroup } from './TasksView.types'

/**
 * Задания по проектам: сначала проекты открытых вкладок в их порядке, потом остальные по имени;
 * внутри - по имени задания. Дом - словом «Home», а не именем своей папки.
 */
export const groupsOf = (
  tasks: readonly Task[],
  workspace: WorkspaceState | undefined,
  homeName: string,
): TaskGroup[] => {
  const open = workspace?.projects ?? []
  const known = [...open, ...(workspace?.recentProjects ?? [])]
  const nameOf = (path: string) => {
    const project = open.find((one) => one.rootPath === path)

    if (project?.home) return homeName

    return known.find((one) => one.rootPath === path)?.name ?? baseName(path)
  }
  const rank = (path: string) => {
    const at = open.findIndex((one) => one.rootPath === path)

    return at < 0 ? open.length : at
  }
  const paths = [...new Set(tasks.map((task) => task.projectPath))]

  return paths
    .map((projectPath) => ({
      projectPath,
      name: nameOf(projectPath),
      tasks: tasks
        .filter((task) => task.projectPath === projectPath)
        .sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort(
      (left, right) =>
        rank(left.projectPath) - rank(right.projectPath) || left.name.localeCompare(right.name),
    )
}

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

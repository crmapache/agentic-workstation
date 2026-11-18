import { isRunOpen } from '@shared/tasks'
import type { TaskRunSummary } from '@shared/tasks'
import type { ProjectRef } from '@shared/workspace'

import type { Choice } from '../tasks.types'
import { baseName, displayPath } from '../../../lib/path.utils'

/**
 * Куда можно перенести задание: открытые проекты, за ними недавние. Свой проект задания, которого
 * уже нет ни там, ни там, остаётся вариантом - иначе поле показало бы голый путь.
 */
export const projectChoices = (
  projects: readonly ProjectRef[],
  current: string,
  homeDir: string | undefined,
): Choice[] => {
  const known = projects.some((project) => project.rootPath === current)
  const all = known ? projects : [{ name: baseName(current), rootPath: current }, ...projects]

  return all.map((project) => ({
    value: project.rootPath,
    label: project.name,
    description: displayPath(project.rootPath, homeDir),
  }))
}

/**
 * Прогон задания идёт, ждёт человека или поручение спит: его разговор - в папке прежнего
 * проекта, переносить задание рано (ADR 0081). Главный процесс проверяет то же сам.
 */
export const isMoveBlocked = (runs: readonly TaskRunSummary[], taskId: string): boolean =>
  runs.some((run) => run.taskId === taskId && isRunOpen(run.state))

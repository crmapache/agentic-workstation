import type { EffortLevel } from '@shared/conversation'
import type { ProviderInfo } from '@shared/providers'
import { providerEfforts } from '@shared/providers'
import { isRunOpen, TASK_MODES } from '@shared/tasks'
import type { TaskMode, TaskDraft, TaskRunSummary } from '@shared/tasks'
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

/** Режимы задания у провайдера: его режимы без плана - у задания нет человека за столом. */
export const taskModesOf = (provider: ProviderInfo | undefined): TaskMode[] =>
  TASK_MODES.filter((mode) => !provider || provider.modes.includes(mode))

/** Уровни усилия модели задания у его провайдера; у модели без размышлений - пусто. */
export const taskEffortsOf = (
  provider: ProviderInfo | undefined,
  model: string,
): readonly EffortLevel[] => providerEfforts(provider ?? null, model)

/**
 * Смена провайдера задания: модель и усилие - его по умолчанию (имена моделей у провайдеров
 * свои), режим - прежний, если он у нового есть, иначе «спрашивать».
 */
export const switchedTo = (draft: TaskDraft, provider: ProviderInfo): Partial<TaskDraft> => ({
  provider: provider.id,
  model: '',
  effort: '',
  ...(!taskModesOf(provider).includes(draft.permissionMode) && { permissionMode: 'default' }),
})

import type { ScenarioQueuesView } from '@shared/scenario-queues'
import type { WorkspaceState } from '@shared/workspace'

import type { Redact } from './fit'
import { asIs } from './fit'

/**
 * Папки машины по дороге на телефон. Проект телефон знает по ключу, но путь живёт и в тексте:
 * в вызове инструмента, в вопросе разрешения, в ошибке прогона. Корень проекта, папки
 * worktree и домашняя папка заменяются метками: телефону - «{project}/src/app.ts», окну IDE -
 * путь как есть (подменяется копия на проводе). Метки в фигурных скобках, а не в угловых:
 * телефон рисует текст разметкой, и «<project>» стал бы для неё тегом HTML.
 */

export const PROJECT_LABEL = '{project}'

export const WORKTREE_LABEL = '{worktree}'

export const HOME_LABEL = '~'

export type Root = { path: string; label: string }

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const trimmed = (path: string): string => path.replace(/\/+$/, '')

/**
 * Подмена путей метками. Длинный корень раньше короткого (worktree внутри домашней папки),
 * и только целым именем: корень /a/proj не цепляет /a/proj2.
 */
export const pathRedactor = (roots: readonly Root[]): Redact => {
  const labels = new Map<string, string>()

  for (const root of roots) {
    const path = trimmed(root.path)

    if (path.startsWith('/') && path.length > 1 && !labels.has(path)) labels.set(path, root.label)
  }

  if (labels.size === 0) return asIs

  const paths = [...labels.keys()].sort((first, second) => second.length - first.length)
  const pattern = new RegExp(paths.map((path) => `${escape(path)}(?![\\w.-])`).join('|'), 'g')

  return (text) =>
    text.includes('/') ? text.replace(pattern, (match) => labels.get(match) ?? match) : text
}

/** Корни, которые знает IDE: проекты (открытые, недавние, с очередями), их worktree, дом. */
export const machineRoots = (
  workspace: WorkspaceState,
  queues: ScenarioQueuesView,
  home: string,
): Root[] => {
  const project = (path: string): Root => ({ path, label: PROJECT_LABEL })
  const worktrees = queues.queues.flatMap((queue) =>
    queue.workdir.kind === 'worktree'
      ? [queue.workdir.path, queue.workdir.projectDir].map((path) => ({
          path,
          label: WORKTREE_LABEL,
        }))
      : [],
  )

  return [
    ...workspace.projects.map((one) => project(one.rootPath)),
    ...workspace.recentProjects.map((one) => project(one.rootPath)),
    ...queues.queues.map((queue) => project(queue.projectPath)),
    ...worktrees,
    { path: home, label: HOME_LABEL },
  ]
}

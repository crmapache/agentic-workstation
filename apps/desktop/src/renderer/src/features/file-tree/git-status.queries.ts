import { useQuery } from '@tanstack/react-query'

import { gitStatusQuery } from '../../state/git-status.queries'
import { treeStatusOf } from './git-status.utils'

/**
 * Статус одной строки дерева. Строка подписана только на свой статус: новый статус
 * проекта перерисовывает лишь те строки, чей цвет поменялся.
 */
export const useTreeStatus = (projectId: string, relativePath: string, isDirectory: boolean) =>
  useQuery({
    ...gitStatusQuery(projectId),
    select: (status) => treeStatusOf(status, relativePath, isDirectory),
  }).data ?? null

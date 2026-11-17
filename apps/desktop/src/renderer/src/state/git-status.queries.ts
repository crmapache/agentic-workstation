import type { GitFolderChange } from '@shared/git'
import { useQuery, queryOptions, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { QUERY_KEYS } from './query-keys'

/**
 * Статусы git проекта. Владелец - главный процесс: он следит за диском и .git и сам
 * присылает новый статус (git:status). Спрашиваем при открытии и при возврате в окно -
 * на случай, если что-то прошло мимо слежения. Нужен дереву файлов и точке на иконке
 * Changes, поэтому живёт здесь.
 */
export const gitStatusQuery = (projectId: string) =>
  queryOptions({
    queryKey: QUERY_KEYS.gitStatus(projectId),
    queryFn: () => invoke('git:getStatus', { projectId }),
    staleTime: Infinity,
    refetchOnWindowFocus: 'always',
  })

/**
 * Есть ли в проекте изменения с последнего коммита - как у папки в дереве: изменения или
 * конфликт; null - нет изменений, проект не в git или статус ещё читается. Подписка только
 * на это: новый статус без смены ответа ничего не перерисовывает.
 */
export const useProjectChange = (projectId: string | undefined): GitFolderChange | null =>
  useQuery({
    ...gitStatusQuery(projectId ?? ''),
    enabled: projectId !== undefined,
    select: (status) => status?.changedFolders[''] ?? null,
  }).data ?? null

/** Новый статус от главного процесса - в кэш. Подключается один раз, в корне окна. */
export const useGitStatusSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('git:status', ({ projectId, status }) => {
    queryClient.setQueryData(QUERY_KEYS.gitStatus(projectId), status)
  })
}

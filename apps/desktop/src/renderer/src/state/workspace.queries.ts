import type { WorkspaceState } from '@shared/workspace'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { heldPaths, guardDiscard } from './discard-guard.store'
import { QUERY_KEYS } from './query-keys'
import { useSelectionStore } from './selection.store'

/**
 * Открытые проекты. Владелец - главный процесс; здесь их зеркало в кэше React
 * Query под одним ключом. Пишут в него три источника - первый запрос, ответы на
 * действия и событие workspace:changed (пункт меню Open Project меняет состояние
 * без участия окна), - и все читают отсюда.
 */
export const useWorkspace = () =>
  useQuery({
    queryKey: QUERY_KEYS.workspace,
    queryFn: () => invoke('workspace:get'),
    staleTime: Infinity,
  })

export const useActiveProject = () => {
  const { data } = useWorkspace()

  return data?.projects.find((project) => project.id === data.activeProjectId) ?? null
}

/**
 * Держит кэш в синхроне с главным процессом. Подключается один раз, в корне окна.
 * Закрытый проект уносит свои вкладки файлов: открытый заново получит новый id.
 */
export const useWorkspaceSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('workspace:changed', (state) => {
    queryClient.setQueryData(QUERY_KEYS.workspace, state)
    useSelectionStore.getState().keepProjects(state.projects.map((project) => project.id))
  })
}

/** Действия над проектами. Ответ главного процесса сразу ложится в кэш. */
export const useWorkspaceActions = () => {
  const queryClient = useQueryClient()
  const onSuccess = (state: WorkspaceState) => queryClient.setQueryData(QUERY_KEYS.workspace, state)

  const open = useMutation({ mutationFn: () => invoke('workspace:openProject'), onSuccess })
  const create = useMutation({ mutationFn: () => invoke('workspace:newProject'), onSuccess })
  const openRecent = useMutation({
    mutationFn: (rootPath: string) => invoke('workspace:openRecentProject', { rootPath }),
    onSuccess,
  })
  const close = useMutation({
    mutationFn: (projectId: string) => invoke('workspace:closeProject', { projectId }),
    onSuccess,
  })
  const activate = useMutation({
    mutationFn: (projectId: string) => invoke('workspace:activateProject', { projectId }),
    onSuccess,
  })
  const move = useMutation({
    mutationFn: (request: { projectId: string; beforeId: string | null }) =>
      invoke('workspace:moveProject', request),
    onSuccess,
  })

  return {
    openProject: () => open.mutate(),
    newProject: () => create.mutate(),
    openRecentProject: (rootPath: string) => openRecent.mutate(rootPath),
    // Несохранённое во вкладках проекта (конфликт с диском) пропадёт вместе с ним - сначала вопрос.
    closeProject: (projectId: string) =>
      guardDiscard('project', heldPaths(projectId), () => close.mutate(projectId)),
    activateProject: (projectId: string) => activate.mutate(projectId),
    // Ответ - порядок переставляемых проектов после перестановки (дом стоит на месте и в ряд
    // жеста не входит): жест вкладок по нему понимает, встал ли ряд.
    moveProject: (projectId: string, beforeId: string | null) =>
      move
        .mutateAsync({ projectId, beforeId })
        .then((state) =>
          state.projects.filter((project) => !project.home).map((project) => project.id),
        ),
  }
}

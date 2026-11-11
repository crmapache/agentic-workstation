import { useTranslation } from 'react-i18next'

import type { GitBranchKind, GitActionResult } from '@shared/git'
import { useQuery, useMutation, useIsMutating, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { useIpcEvent } from '../../lib/ipc.hooks'
import { useActionNoticeStore } from '../../state/action-notice.store'
import { QUERY_KEYS } from '../../state/query-keys'
import { PULL_REQUEST_STALE_MS } from './git.constants'

/**
 * Ветка проекта. Ветку часто переключают в терминале, и шапка не должна врать:
 * перечитывается, когда главный процесс видит изменения в .git (useGitHeadSync), и
 * на всякий случай при возврате в окно.
 */
export const useGitHead = (projectId: string | undefined) =>
  useQuery({
    queryKey: QUERY_KEYS.gitHead(projectId ?? ''),
    queryFn: () => invoke('git:getHead', { projectId: projectId ?? '' }),
    enabled: projectId !== undefined,
    staleTime: Infinity,
    refetchOnWindowFocus: 'always',
  })

/** Поменялся .git (переключили ветку, сделали коммит) - перечитать ветку проекта. */
export const useGitHeadSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('fs:changed', ({ projectId, git }) => {
    if (git) void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gitHead(projectId) })
  })
}

/**
 * PR ветки через gh. Ключ - с веткой: переключили ветку - спрашивается её PR, а не
 * показывается чужой. Заново при возврате в окно (PR создают и сливают в браузере),
 * но не чаще раза в минуту: gh ходит в сеть.
 */
export const usePullRequest = (projectId: string, branch: string) =>
  useQuery({
    queryKey: QUERY_KEYS.gitPullRequest(projectId, branch),
    queryFn: () => invoke('git:getPullRequest', { projectId }),
    staleTime: PULL_REQUEST_STALE_MS,
    refetchOnWindowFocus: true,
  })

/** Ветки - когда открыто меню ветки, и каждый раз заново. */
export const useGitBranches = (projectId: string) =>
  useQuery({
    queryKey: QUERY_KEYS.gitBranches(projectId),
    queryFn: () => invoke('git:listBranches', { projectId }),
    staleTime: 0,
  })

/** Что уйдёт при push - для окна подтверждения, пока оно открыто. */
export const usePushInfo = (projectId: string, enabled: boolean) =>
  useQuery({
    queryKey: QUERY_KEYS.gitPushInfo(projectId),
    queryFn: () => invoke('git:getPushInfo', { projectId }),
    enabled,
    staleTime: 0,
  })

/**
 * Одно действие git: запустить, после - перечитать, что могло поменяться. Ключ - у
 * действия, занятость которого должны видеть все: хук зовут и шапка, и поиск везде,
 * а у каждого вызова свой экземпляр мутации.
 */
const useGitAction = <Input>(
  run: (input: Input) => Promise<GitActionResult>,
  refresh: () => Promise<unknown>,
  mutationKey?: readonly unknown[],
) => useMutation({ ...(mutationKey && { mutationKey }), mutationFn: run, onSettled: refresh })

/**
 * Действия git над проектом. После любого - перечитать ветку, ветки, сведения для
 * push, дерево файлов и статусы git. Слежение за диском сказало бы о том же, но
 * чуть позже: итог действия человек ждёт сразу. Итог
 * возвращается тому, кто звал: диалоги показывают ошибку у себя.
 */
export const useGitActions = (projectId: string) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const show = useActionNoticeStore((state) => state.show)

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gitHead(projectId) }),
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gitBranches(projectId) }),
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gitPushInfo(projectId) }),
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projectDirectories(projectId) }),
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gitStatus(projectId) }),
    ])

  const switchBranch = useGitAction(
    ({ branch, kind }: { branch: string; kind: GitBranchKind }) =>
      invoke('git:switchBranch', { projectId, branch, kind }),
    refresh,
  )
  const createBranch = useGitAction(
    (name: string) => invoke('git:createBranch', { projectId, name }),
    refresh,
  )
  const checkoutRevision = useGitAction(
    (revision: string) => invoke('git:checkoutRevision', { projectId, revision }),
    refresh,
  )
  const pull = useGitAction(
    () => invoke('git:pull', { projectId }),
    refresh,
    QUERY_KEYS.gitPull(projectId),
  )
  const isPulling = useIsMutating({ mutationKey: QUERY_KEYS.gitPull(projectId) }) > 0
  const push = useGitAction(() => invoke('git:push', { projectId }), refresh)

  /** Переключение из меню: неудача - в угол окна, успех виден по шапке. */
  const switchTo = async (branch: string, kind: GitBranchKind) => {
    const result = await switchBranch.mutateAsync({ branch, kind })

    if (!result.ok)
      show({ tone: 'danger', title: t('git.switchFailed', { branch }), details: result.details })
  }

  /**
   * Update Project: итог в угол окна в любом случае - в шапке его не видно. Pull уже
   * идёт (запущен из меню или из поиска) - второй не начинается.
   */
  const update = async () => {
    if (queryClient.isMutating({ mutationKey: QUERY_KEYS.gitPull(projectId) }) > 0) return

    const result = await pull.mutateAsync()

    show(
      result.ok
        ? { tone: 'success', title: t('git.updated'), details: result.summary }
        : { tone: 'danger', title: t('git.updateFailed'), details: result.details },
    )
  }

  return { switchTo, update, createBranch, checkoutRevision, push, isBusy: isPulling }
}

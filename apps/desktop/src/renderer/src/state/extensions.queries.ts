import { useEffect } from 'react'

import type { ExtensionViewTree } from '@shared/extension-ui'
import type { ExtensionLogEntry } from '@shared/extensions'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { useExtensionDialogs } from './extension-dialogs.store'
import { applyExtensionTheme } from './extension-theme'
import { useLayoutStore } from './layout.store'
import { QUERY_KEYS } from './query-keys'

/** Деревья видов расширений по ключу вида. */
export type ExtensionViewTrees = Record<string, ExtensionViewTree>

const byKey = (trees: readonly ExtensionViewTree[]): ExtensionViewTrees =>
  Object.fromEntries(trees.map((tree) => [tree.key, tree]))

/** Расширения IDE (ADR 0091): владелец - главный процесс, здесь зеркало. */
export const useExtensions = () =>
  useQuery({
    queryKey: QUERY_KEYS.extensions,
    queryFn: () => invoke('extensions:get'),
    staleTime: Infinity,
  })

/** Деревья всех видов расширений: окно, поднявшееся позже, берёт их одним запросом. */
export const useExtensionViewTrees = () =>
  useQuery({
    queryKey: QUERY_KEYS.extensionViews,
    queryFn: async () => byKey(await invoke('extensions:views')),
    staleTime: Infinity,
  })

/** Журнал расширения: снимок по запросу, новое дописывает событие extensions:logged. */
export const useExtensionLogs = (id: string) =>
  useQuery({
    queryKey: QUERY_KEYS.extensionLogs(id),
    queryFn: () => invoke('extensions:logs', { id }),
    staleTime: Infinity,
  })

/**
 * События расширений: состояние целиком, новое дерево вида, журнал, вопросы человеку, показ
 * вида. Тема ставится на корень документа здесь же - одна подписка на окно.
 */
export const useExtensionsSync = () => {
  const queryClient = useQueryClient()
  const push = useExtensionDialogs((store) => store.push)
  const remove = useExtensionDialogs((store) => store.remove)
  const { data } = useExtensions()

  useEffect(() => {
    if (data) applyExtensionTheme(data.theme)
  }, [data])

  // Вопросы, заданные до того, как окно поднялось (перезагрузка окна), - тоже на виду.
  useEffect(() => {
    void invoke('extensions:pendingDialogs').then((requests) => requests.forEach(push))
  }, [push])

  useIpcEvent('extensions:changed', (state) => {
    queryClient.setQueryData(QUERY_KEYS.extensions, state)
  })
  useIpcEvent('extensions:view', (tree) => {
    queryClient.setQueryData<ExtensionViewTrees>(QUERY_KEYS.extensionViews, (trees) =>
      trees ? { ...trees, [tree.key]: tree } : trees,
    )
  })
  useIpcEvent('extensions:logged', ({ id, entries }) => {
    queryClient.setQueryData<ExtensionLogEntry[]>(QUERY_KEYS.extensionLogs(id), (logs) =>
      logs ? [...logs, ...entries].slice(-300) : logs,
    )
  })
  useIpcEvent('extensions:dialog', push)
  useIpcEvent('extensions:dialogClosed', ({ requestId }) => remove(requestId))
  useIpcEvent('extensions:showView', ({ key }) => {
    const place = queryClient
      .getQueryData<NonNullable<ReturnType<typeof useExtensions>['data']>>(QUERY_KEYS.extensions)
      ?.extensions.flatMap((item) => item.contributions.views)
      .find((view) => view.key === key)?.place

    if (place === 'side') useLayoutStore.getState().showSideView(`ext:${key}`)
    else useLayoutStore.getState().showMainView(`ext:${key}`)
  })
}

import type { MemorySaverState } from '@shared/memory-saver'
import { useQuery, useMutation, queryOptions, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { newerMemorySaverState, editorServicesAvailable } from './memory-saver.utils'
import type { MemorySaverAction } from './memory-saver.utils'
import { QUERY_KEYS } from './query-keys'

/**
 * Настройка и подтверждённое состояние служб. Снимок сверяется с кэшем по версии в самом запросе:
 * событие из другого окна, пришедшее, пока снимок шёл, не перебивается старым ответом.
 */
export const memorySaverQuery = queryOptions({
  queryKey: QUERY_KEYS.memorySaver,
  queryFn: async ({ client }) => {
    const incoming = await invoke('memorySaver:get')

    return newerMemorySaverState(
      client.getQueryData<MemorySaverState>(QUERY_KEYS.memorySaver),
      incoming,
    )
  },
  staleTime: Infinity,
})

/** Только «можно ли спрашивать определения»: редакторы будит смена флага, а не каждое событие. */
export const editorServicesQuery = queryOptions({
  ...memorySaverQuery,
  select: editorServicesAvailable,
})

/** Состояние целиком - для кнопки экономии. */
export const useMemorySaver = () => useQuery(memorySaverQuery)

/** Подписка одна на окно; кэш общий для кнопки и редактора. */
export const useMemorySaverSync = () => {
  const client = useQueryClient()

  useIpcEvent('memorySaver:changed', (state) => {
    client.setQueryData<MemorySaverState>(QUERY_KEYS.memorySaver, (current) =>
      newerMemorySaverState(current, state),
    )
  })
}

/**
 * Меняет режим или повторяет текущий выбор на стороне главного процесса: быстрые нажатия не
 * теряются из-за старого снимка окна.
 */
export const useChangeMemorySaver = () => {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (action: MemorySaverAction) =>
      invoke(action === 'retry' ? 'memorySaver:retry' : 'memorySaver:toggle'),
    onSuccess: (state) => {
      client.setQueryData<MemorySaverState>(QUERY_KEYS.memorySaver, (current) =>
        newerMemorySaverState(current, state),
      )
    },
  })
}

/** Выбор ещё не прочитан - считаем службы запрещёнными, как и главный процесс. */
export const useEditorServicesAvailable = () => useQuery(editorServicesQuery).data ?? false

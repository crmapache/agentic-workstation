import type { IdePrefs, IdePrefsPatch } from '@shared/ide-prefs'
import { DEFAULT_IDE_PREFS } from '@shared/ide-prefs'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { QUERY_KEYS } from './query-keys'

/**
 * Общие настройки IDE (Settings): сворачивание вставки в поле любого провайдера, кто пишет
 * сообщение коммита. Владелец - главный процесс; до ответа - умолчания.
 */
export const useIdePrefs = (): IdePrefs =>
  useQuery({
    queryKey: QUERY_KEYS.idePrefs,
    queryFn: () => invoke('idePrefs:get'),
    staleTime: Infinity,
  }).data ?? DEFAULT_IDE_PREFS

/** Держит кэш в синхроне с главным процессом. Подключается один раз, в корне окна. */
export const useIdePrefsSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('idePrefs:changed', (value) => {
    queryClient.setQueryData(QUERY_KEYS.idePrefs, value)
  })
}

/** Правка поверх нынешних; встала - в кэш ответом, не перезапросом. */
export const useSetIdePrefs = (): ((patch: IdePrefsPatch) => Promise<IdePrefs>) => {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (patch: IdePrefsPatch) => invoke('idePrefs:set', { patch }),
    onSuccess: (value) => queryClient.setQueryData(QUERY_KEYS.idePrefs, value),
  })

  return save.mutateAsync
}

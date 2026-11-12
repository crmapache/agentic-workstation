import type { SoundPrefs } from '@shared/sounds'
import { DEFAULT_SOUND_PREFS } from '@shared/sounds'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { QUERY_KEYS } from './query-keys'

/** Запрос настройки звуков: один на окно, свежесть держит событие sounds:changed. */
export const soundPrefsQuery = {
  queryKey: QUERY_KEYS.soundPrefs,
  queryFn: () => invoke('sounds:get'),
  staleTime: Infinity,
}

/**
 * Звуки IDE (ADR 0046) - их читают окно настроек (Settings → Sounds) и звук зова разговора.
 * Владелец - главный процесс; до ответа - умолчания.
 */
export const useSoundPrefs = (): SoundPrefs => useQuery(soundPrefsQuery).data ?? DEFAULT_SOUND_PREFS

/** Держит кэш в синхроне с главным процессом. Подключается один раз, в корне окна. */
export const useSoundsSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('sounds:changed', (prefs) => {
    queryClient.setQueryData(QUERY_KEYS.soundPrefs, prefs)
  })
}

/** Записать настройку звуков целиком; встала - в кэш ответом, не перезапросом. */
export const useSetSoundPrefs = (): ((prefs: SoundPrefs) => Promise<SoundPrefs>) => {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (prefs: SoundPrefs) => invoke('sounds:set', { prefs }),
    onSuccess: (prefs) => queryClient.setQueryData(QUERY_KEYS.soundPrefs, prefs),
  })

  return save.mutateAsync
}

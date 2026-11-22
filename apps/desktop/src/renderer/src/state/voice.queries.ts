import type { VoiceView, VoiceKeyCheck, VoiceSettings, VoiceStartOutcome } from '@shared/voice'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { QUERY_KEYS } from './query-keys'

/**
 * Голосовой режим (ADR 0104): настройки, есть ли ключ Deepgram, можно ли звонить и звонок,
 * который идёт. Владелец - главный процесс; до ответа - undefined.
 */
export const useVoice = (): VoiceView | undefined =>
  useQuery({
    queryKey: QUERY_KEYS.voice,
    queryFn: () => invoke('voice:get'),
    staleTime: Infinity,
  }).data

/** Держит кэш в синхроне с главным процессом. Подключается один раз, в корне окна. */
export const useVoiceSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('voice:changed', (view) => {
    queryClient.setQueryData(QUERY_KEYS.voice, view)
  })
}

/** Записать настройки целиком; встали - в кэш ответом. */
export const useSetVoiceSettings = (): ((settings: VoiceSettings) => Promise<VoiceView>) => {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (settings: VoiceSettings) => invoke('voice:setSettings', { settings }),
    onSuccess: (view) => queryClient.setQueryData(QUERY_KEYS.voice, view),
  })

  return save.mutateAsync
}

/** Сохранить или забыть ключ Deepgram; окно его обратно не получает. */
export const useSetVoiceKey = (): ((key: string | null) => Promise<VoiceView>) => {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (key: string | null) => invoke('voice:setKey', { key }),
    onSuccess: (view) => queryClient.setQueryData(QUERY_KEYS.voice, view),
  })

  return save.mutateAsync
}

/** Проверка ключа: присланного или сохранённого. */
export const checkVoiceKey = (key: string | null): Promise<VoiceKeyCheck> =>
  invoke('voice:checkKey', { key })

/** Начать звонок из панели; ответ - звонок или причина отказа. */
export const useStartVoiceCall = () => {
  const start = useMutation({
    mutationFn: (): Promise<VoiceStartOutcome> => invoke('voice:start'),
  })

  return { start: start.mutateAsync, isStarting: start.isPending }
}

/** Действия звонка, который идёт: положить трубку, «Стоп», микрофон. */
export const voiceCallActions = (callId: string) => ({
  end: () => invoke('voice:end', { callId }),
  stop: () => invoke('voice:stop', { callId }),
  mute: (on: boolean) => invoke('voice:mute', { callId, on }),
})

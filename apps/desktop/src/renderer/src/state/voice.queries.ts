import type {
  VoiceView,
  VoiceKeyCheck,
  VoiceSettings,
  VoiceStartOutcome,
  VoiceSetKeyOutcome,
} from '@shared/voice'
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

/** Сохранить или забыть ключ Deepgram; окно его обратно не получает. Не встал - причина. */
export const useSetVoiceKey = (): ((key: string | null) => Promise<VoiceSetKeyOutcome>) => {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (key: string | null) => invoke('voice:setKey', { key }),
    onSuccess: (outcome) => {
      if (outcome.ok) queryClient.setQueryData(QUERY_KEYS.voice, outcome.view)
    },
  })

  return save.mutateAsync
}

/** Проверка ключа: присланного или сохранённого. */
export const checkVoiceKey = (key: string | null): Promise<VoiceKeyCheck> =>
  invoke('voice:checkKey', { key })

/** Начать звонок из панели; ответ - звонок или причина отказа, состояние - в кэш. */
export const useStartVoiceCall = () => {
  const queryClient = useQueryClient()
  const start = useMutation({
    mutationFn: () => invoke('voice:start'),
    onSuccess: ({ view }) => queryClient.setQueryData(QUERY_KEYS.voice, view),
  })

  return {
    start: async (): Promise<VoiceStartOutcome> => (await start.mutateAsync()).outcome,
    isStarting: start.isPending,
  }
}

/** Действия звонка, который идёт: положить трубку, «Стоп», микрофон; ответ - в кэш. */
export const useVoiceCallActions = (callId: string) => {
  const queryClient = useQueryClient()
  const put = (view: VoiceView) => queryClient.setQueryData(QUERY_KEYS.voice, view)

  return {
    end: () => void invoke('voice:end', { callId }).then(put),
    stop: () => void invoke('voice:stop', { callId }).then(put),
    mute: (on: boolean) => void invoke('voice:mute', { callId, on }).then(put),
  }
}

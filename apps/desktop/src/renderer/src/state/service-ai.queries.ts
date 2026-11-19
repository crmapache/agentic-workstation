import type { ServiceAi } from '@shared/service-ai'
import { DEFAULT_SERVICE_AI } from '@shared/service-ai'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { QUERY_KEYS } from './query-keys'

/**
 * Провайдер служебной работы IDE (Settings → AI): имена очередей, проверки поручений, черновики.
 * Владелец - главный процесс; до ответа - умолчания (Claude Code).
 */
export const useServiceAi = (): ServiceAi =>
  useQuery({
    queryKey: QUERY_KEYS.serviceAi,
    queryFn: () => invoke('serviceAi:get'),
    staleTime: Infinity,
  }).data ?? DEFAULT_SERVICE_AI

/** Держит кэш в синхроне с главным процессом. Подключается один раз, в корне окна. */
export const useServiceAiSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('serviceAi:changed', (value) => {
    queryClient.setQueryData(QUERY_KEYS.serviceAi, value)
  })
}

/** Записать настройку целиком; встала - в кэш ответом, не перезапросом. */
export const useSetServiceAi = (): ((value: ServiceAi) => Promise<ServiceAi>) => {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (value: ServiceAi) => invoke('serviceAi:set', { value }),
    onSuccess: (value) => queryClient.setQueryData(QUERY_KEYS.serviceAi, value),
  })

  return save.mutateAsync
}

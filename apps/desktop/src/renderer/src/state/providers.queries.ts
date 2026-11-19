import type { ProviderId, ProviderInfo } from '@shared/providers'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { QUERY_KEYS } from './query-keys'

/**
 * Провайдеры ИИ, их модели, уровни и режимы (providers:list) - всё, где работа начинается вне
 * панели: сценарии, задания, коннектор от ИИ, Settings → AI. Перемены (каталог моделей, свои
 * модели, подключения, CLI нашёлся) главный процесс присылает сам.
 */
export const useProviders = () =>
  useQuery({ queryKey: QUERY_KEYS.providers, queryFn: () => invoke('providers:list') })

/** Держит список в синхроне с главным процессом. Подключается один раз, в корне окна. */
export const useProvidersSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('providers:changed', (providers) => {
    queryClient.setQueryData(QUERY_KEYS.providers, providers)
  })
}

/**
 * Провайдер, на котором пойдёт работа: выбранный человеком; иначе предпочтительный (провайдер
 * сценария), если он стоит на машине; иначе первый, что стоит; иначе первый - пусть окно скажет,
 * почему его нет. Одно правило на запуск, час, задание, коннектор и новый сценарий: выбор, пока
 * человек его не трогал, считается при показе, а не застывает в момент открытия окна.
 */
export const effectiveProvider = (
  providers: readonly ProviderInfo[],
  chosen: ProviderId | null,
  preferred: ProviderId | null = null,
): ProviderInfo | null =>
  providers.find((one) => one.id === chosen) ??
  providers.find((one) => one.id === preferred && one.available) ??
  providers.find((one) => one.available) ??
  providers[0] ??
  null

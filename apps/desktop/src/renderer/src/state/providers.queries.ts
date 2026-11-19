import type { ProviderId, ProviderInfo } from '@shared/providers'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { takesIdeWork } from '../lib/provider-choices'
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
 * сценария), если он её возьмёт; иначе первый, что возьмёт; иначе первый, кому такая работа
 * вообще разрешена, - пусть окно скажет, что его нет на машине. Провайдер только для чата
 * (Antigravity, ADR 0094) сам не выбирается никогда. Одно правило на запуск, час, задание,
 * коннектор, расширение и новый сценарий: выбор, пока человек его не трогал, считается при
 * показе, а не застывает в момент открытия окна.
 */
export const effectiveProvider = (
  providers: readonly ProviderInfo[],
  chosen: ProviderId | null,
  preferred: ProviderId | null = null,
): ProviderInfo | null =>
  providers.find((one) => one.id === chosen) ??
  providers.find((one) => one.id === preferred && takesIdeWork(one)) ??
  providers.find(takesIdeWork) ??
  providers.find((one) => one.chatOnly !== true) ??
  providers[0] ??
  null

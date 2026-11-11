import type { DefaultOptions } from '@tanstack/react-query'

/**
 * Кэш - зеркало IDE: данные свежие, пока IDE не скажет иное (она шлёт перемены сама), и не
 * выбрасываются - вернулся на экран, а там уже последнее известное.
 */
export const QUERY_DEFAULTS: DefaultOptions = {
  queries: {
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  },
  mutations: { retry: false },
}

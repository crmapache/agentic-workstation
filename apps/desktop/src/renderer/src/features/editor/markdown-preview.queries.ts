import type { WebImageRead } from '@shared/preview-images'
import { useQuery } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { QUERY_KEYS } from '../../state/query-keys'

/**
 * Картинка с сайта - только когда человек разрешил (enabled): грузит главный процесс,
 * окно в сеть не ходит. Одна на окно по адресу.
 */
export const useWebImage = (url: string, enabled: boolean) =>
  useQuery({
    queryKey: QUERY_KEYS.webImage(url),
    queryFn: (): Promise<WebImageRead> => invoke('preview:readWebImage', { url }),
    staleTime: Infinity,
    enabled,
  })

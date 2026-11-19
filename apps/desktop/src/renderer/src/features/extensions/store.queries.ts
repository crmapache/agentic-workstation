import type { StorePage, StoreSort, StoreResult } from '@shared/extension-store'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { QUERY_KEYS } from '../../state/query-keys'

/** Ответ магазина как есть: страница или причина. Запрос не падает - окно показывает причину. */
const STALE_MS = 60_000

/** Каталог магазина страницами: «Show more» берёт следующую. */
export const useStoreList = (q: string, sort: StoreSort) =>
  useInfiniteQuery({
    queryKey: QUERY_KEYS.storeList(q, sort),
    queryFn: ({ pageParam }) => invoke('extensions:storeList', { q, sort, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last: StoreResult<StorePage>, pages: StoreResult<StorePage>[]) => {
      if (!last.ok) return undefined

      const loaded = pages.reduce((sum, page) => sum + (page.ok ? page.value.items.length : 0), 0)

      return loaded < last.value.total ? loaded : undefined
    },
    staleTime: STALE_MS,
  })

/** Расширение из магазина целиком: карточка, первые отзывы, стоит ли здесь, своё ли. */
export const useStoreView = (id: string) =>
  useQuery({
    queryKey: QUERY_KEYS.storeView(id),
    queryFn: () => invoke('extensions:storeView', { id }),
    staleTime: STALE_MS,
  })

/** Обновления поставленного из магазина: при каждом показе вкладки, не чаще раза в минуту. */
export const useStoreUpdates = () =>
  useQuery({
    queryKey: QUERY_KEYS.storeUpdates,
    queryFn: () => invoke('extensions:storeUpdates'),
    staleTime: STALE_MS,
  })

/** Кто эта IDE в магазине: имя автора. Ключ заводится при первом вопросе. */
export const useStoreIdentity = (enabled: boolean) =>
  useQuery({
    queryKey: QUERY_KEYS.storeIdentity,
    queryFn: () => invoke('extensions:storeIdentity'),
    enabled,
    staleTime: Infinity,
  })

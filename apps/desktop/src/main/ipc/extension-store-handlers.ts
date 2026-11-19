import type { StoreSort } from '@shared/extension-store'
import type { ExtensionStoreInvokeContract } from '@shared/ipc/extension-store.contract'

import type { ExtensionStore } from '../extensions/store/extension-store'
import type { InvokeHandlers } from './handle'
import { assertOneOf, assertString } from './validate'

type StoreChannels = keyof ExtensionStoreInvokeContract

const SORTS: readonly StoreSort[] = ['popular', 'rating', 'new']

const offsetOf = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? Math.min(value, 100_000) : 0

/** Каналы магазина расширений (ADR 0091): проверить запрос окна и позвать магазин. */
export const createExtensionStoreHandlers = (
  shop: ExtensionStore,
): Pick<InvokeHandlers, StoreChannels> => ({
  'extensions:storeList': ({ q, sort, offset }) => {
    assertString(q, 'q')

    return shop.list({
      q: q.slice(0, 100),
      sort: assertOneOf(sort, SORTS, 'sort'),
      offset: offsetOf(offset),
    })
  },
  'extensions:storeView': ({ id }) => {
    assertString(id, 'id')

    return shop.view(id)
  },
  'extensions:storeReviews': ({ id, offset }) => {
    assertString(id, 'id')

    return shop.reviews(id, offsetOf(offset))
  },
  'extensions:storeInstall': ({ id, version }) => {
    assertString(id, 'id')
    if (version !== null) assertString(version, 'version')

    return shop.install(id, version)
  },
  'extensions:storePublish': ({ id }) => {
    assertString(id, 'id')

    return shop.publish(id)
  },
  'extensions:storeReview': async ({ id, rating, text }) => {
    assertString(id, 'id')
    assertString(text, 'text')

    if (typeof rating !== 'number') throw new Error('Ожидалась оценка числом')

    const result = await shop.review(id, rating, text.slice(0, 2000))

    return result.ok ? { ok: true, value: null } : result
  },
  'extensions:storeReport': async ({ id, reason }) => {
    assertString(id, 'id')
    assertString(reason, 'reason')

    const result = await shop.report(id, reason.slice(0, 2000))

    return result.ok ? { ok: true, value: null } : result
  },
  'extensions:storeUnpublish': async ({ id }) => {
    assertString(id, 'id')

    const result = await shop.unpublish(id)

    return result.ok ? { ok: true, value: null } : result
  },
  'extensions:storeIdentity': () => shop.identity(),
  'extensions:storeRename': ({ name }) => {
    assertString(name, 'name')

    return shop.rename(name.slice(0, 60))
  },
  'extensions:storeUpdates': () => shop.updates(),
})

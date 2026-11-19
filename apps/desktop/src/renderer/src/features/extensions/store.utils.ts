import type { TFunction } from 'i18next'

import type { StoreResult, StoreListing } from '@shared/extension-store'

/** Причина отказа магазина словами окна (сообщение сервера - внутри, где оно полезно). */
export const storeErrorText = (
  t: TFunction,
  result: Extract<StoreResult<unknown>, { ok: false }>,
): string => t(`extensions.store.errors.${result.error}`, { message: result.message })

/** Подпись плитки магазина: оценка, установки, автор. */
export const listingMeta = (t: TFunction, listing: StoreListing): string =>
  [
    listing.rating.count
      ? t('extensions.store.rating', {
          average: listing.rating.average.toFixed(1),
          count: listing.rating.count,
        })
      : t('extensions.store.noRating'),
    t('extensions.store.installs', { count: listing.installs }),
    t('extensions.store.by', { name: listing.publisher.name }),
  ].join(' · ')

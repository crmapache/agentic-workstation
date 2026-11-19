import type { StoreListingView } from '@shared/extension-store'

/** Что делает главная кнопка карточки: поставить, обновить или ничего - уже стоит или своя папка. */
export type ListingAction =
  { kind: 'install'; allow: boolean } | { kind: 'update'; version: string } | { kind: 'none' }

export const listingAction = (view: StoreListingView): ListingAction => {
  const { listing, installed } = view

  if (!installed) return { kind: 'install', allow: listing.permissions.length > 0 }
  if (installed.local) return { kind: 'none' }

  return installed.version !== listing.version
    ? { kind: 'update', version: listing.version }
    : { kind: 'none' }
}

const DAY = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

/** Дата отзыва и версии: день без времени. */
export const dayOf = (at: number): string => DAY.format(at)

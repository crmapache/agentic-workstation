import type { ExtensionPermission } from './extensions'

/**
 * Магазин расширений глазами окна (ADR 0091): каталог, расширение с версиями и оценками, отзывы.
 * Форма - та же, что у ответов сервера (пакет store-protocol); главный процесс отдаёт их как есть.
 */

export type StorePublisher = { id: string; name: string }

export type StoreListing = {
  id: string
  name: string
  description: string
  icon: string
  version: string
  publisher: StorePublisher
  rating: { average: number; count: number }
  installs: number
  permissions: ExtensionPermission[]
  updatedAt: number
}

export type StoreVersion = {
  version: string
  publishedAt: number
  digest: string
  size: number
  permissions: ExtensionPermission[]
  hosts: string[]
  commands: string[]
}

export type StoreListingDetail = StoreListing & {
  readme: string
  createdAt: number
  versions: StoreVersion[]
  ratings: [number, number, number, number, number]
}

export type StoreReview = {
  author: StorePublisher
  rating: number
  text: string
  version: string
  createdAt: number
  updatedAt: number
}

export type StoreSort = 'popular' | 'rating' | 'new'

/**
 * Почему магазин отказал - словами окна: нет сети, нет такого, чужое, версия не выше, часто,
 * не ставил, своё, пакет негодный или подменён, нет хранилища ключей, своя папка с тем же id.
 */
export type StoreFailure =
  | 'offline'
  | 'not-found'
  | 'not-owner'
  | 'version-exists'
  | 'rate-limited'
  | 'not-installed'
  | 'own-extension'
  | 'invalid-package'
  | 'digest-mismatch'
  | 'no-keychain'
  | 'exists-local'
  | 'too-large'
  | 'bad-request'
  | 'bad-signature'
  | 'server'

export type StoreResult<T> =
  { ok: true; value: T } | { ok: false; error: StoreFailure; message: string }

/** Страница каталога. */
export type StorePage = { items: StoreListing[]; total: number }

/** Расширение из магазина целиком: карточка, первые отзывы и что о нём знает эта IDE. */
export type StoreListingView = {
  listing: StoreListingDetail
  reviews: { items: StoreReview[]; total: number }
  /** Стоит ли здесь и какой версии; из чужой папки с тем же id - local. */
  installed: { version: string; local: boolean } | null
  /** Свой ли это: опубликован ключом этой IDE. */
  mine: boolean
}

/** Установленное из магазина, у чего вышла версия новее. */
export type StoreUpdate = { id: string; installed: string; latest: string }

/** Кто эта IDE в магазине: имя под публикациями и отзывами. */
export type StoreIdentity = StorePublisher

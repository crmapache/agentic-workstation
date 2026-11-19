import type { KnownPermission } from './package-format.ts'

/** Ответы API магазина: что видит IDE. Сервер собирает их из своей базы. */

export type Publisher = { id: string; name: string }

export type Rating = { average: number; count: number }

/** Расширение в списке магазина. */
export type ListingSummary = {
  id: string
  name: string
  description: string
  icon: string
  version: string
  publisher: Publisher
  rating: Rating
  installs: number
  permissions: KnownPermission[]
  updatedAt: number
}

export type ListingVersion = {
  version: string
  publishedAt: number
  digest: string
  size: number
  permissions: KnownPermission[]
  hosts: string[]
  commands: string[]
}

/** Расширение целиком: README, все версии, разбивка оценок. */
export type ListingDetail = ListingSummary & {
  readme: string
  createdAt: number
  versions: ListingVersion[]
  /** Сколько оценок 1..5: индекс 0 - единицы. */
  ratings: [number, number, number, number, number]
}

export type ListingSort = 'popular' | 'rating' | 'new'

export type ListingPage = { items: ListingSummary[]; total: number }

export type Review = {
  author: Publisher
  rating: number
  text: string
  version: string
  createdAt: number
  updatedAt: number
}

export type ReviewPage = { items: Review[]; total: number }

/** Ответ на публикацию: версия встала, отпечаток пакета. */
export type Published = { id: string; version: string; digest: string }

/** Ошибка API: код для окна и слова для журнала. */
export type StoreError = { error: StoreErrorCode; message: string }

export type StoreErrorCode =
  | 'bad-request'
  | 'unsigned'
  | 'bad-signature'
  | 'not-found'
  | 'not-owner'
  | 'version-exists'
  | 'too-large'
  | 'rate-limited'
  | 'own-extension'
  | 'not-installed'
  | 'server'

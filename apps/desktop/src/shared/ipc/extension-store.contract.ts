import type {
  StorePage,
  StoreSort,
  StoreResult,
  StoreUpdate,
  StoreIdentity,
  StoreListingView,
} from '../extension-store'
import type { ExtensionsState } from '../extensions'

/**
 * Часть контракта про магазин расширений (ADR 0091): каталог, карточка, отзывы, установка,
 * публикация, имя автора. Ответ - значение или причина словами окна (StoreFailure).
 */
export type ExtensionStoreInvokeContract = {
  'extensions:storeList': {
    request: { q: string; sort: StoreSort; offset: number }
    response: StoreResult<StorePage>
  }
  'extensions:storeView': { request: { id: string }; response: StoreResult<StoreListingView> }
  'extensions:storeReviews': {
    request: { id: string; offset: number }
    response: StoreResult<StoreListingView['reviews']>
  }
  'extensions:storeInstall': {
    request: { id: string; version: string | null }
    response: StoreResult<ExtensionsState>
  }
  'extensions:storePublish': { request: { id: string }; response: StoreResult<{ version: string }> }
  'extensions:storeReview': {
    request: { id: string; rating: number; text: string }
    response: StoreResult<null>
  }
  'extensions:storeReport': { request: { id: string; reason: string }; response: StoreResult<null> }
  'extensions:storeUnpublish': { request: { id: string }; response: StoreResult<null> }
  'extensions:storeIdentity': { request: void; response: StoreResult<StoreIdentity> }
  'extensions:storeRename': { request: { name: string }; response: StoreResult<StoreIdentity> }
  'extensions:storeUpdates': { request: void; response: StoreResult<StoreUpdate[]> }
}

export const EXTENSION_STORE_CHANNELS = {
  'extensions:storeList': true,
  'extensions:storeView': true,
  'extensions:storeReviews': true,
  'extensions:storeInstall': true,
  'extensions:storePublish': true,
  'extensions:storeReview': true,
  'extensions:storeReport': true,
  'extensions:storeUnpublish': true,
  'extensions:storeIdentity': true,
  'extensions:storeRename': true,
  'extensions:storeUpdates': true,
} satisfies Record<keyof ExtensionStoreInvokeContract, true>

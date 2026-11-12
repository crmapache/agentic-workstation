import type { PushStrings } from '../push/push-text'

/**
 * Что сервис-воркер берёт у браузера - узко и своими типами: телефонный код проверяется
 * библиотекой DOM, а в ней нет ServiceWorkerGlobalScope и его событий. Тест подставляет
 * подделку той же формы.
 */

export type ExtendableEventLike = { waitUntil: (work: Promise<unknown>) => void }

export type PushEventLike = ExtendableEventLike & {
  data: { arrayBuffer: () => ArrayBuffer } | null
}

export type NotificationClickLike = ExtendableEventLike & {
  notification: { close: () => void; data: unknown }
}

export type FetchEventLike = {
  request: Request
  respondWith: (response: Promise<Response | undefined>) => void
}

export type WindowClientLike = {
  url: string
  focus: () => Promise<unknown>
  postMessage: (message: unknown) => void
}

/** Уведомление: tag - одно на разговор или очередь, renotify - замена звенит, а не молчит. */
export type ShownOptions = {
  body: string
  tag: string
  icon: string
  badge: string
  renotify: boolean
  data: { url: string }
}

export type WorkerScope = {
  location: { origin: string }
  registration: { showNotification: (title: string, options: ShownOptions) => Promise<void> }
  clients: {
    matchAll: (options: {
      type: 'window'
      includeUncontrolled: boolean
    }) => Promise<readonly WindowClientLike[]>
    openWindow: (url: string) => Promise<unknown>
    claim: () => Promise<void>
  }
  skipWaiting: () => Promise<void>
  addEventListener: {
    (type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void
    (type: 'fetch', listener: (event: FetchEventLike) => void): void
    (type: 'push', listener: (event: PushEventLike) => void): void
    (type: 'notificationclick', listener: (event: NotificationClickLike) => void): void
  }
}

/** Что сборка кладёт в воркер (build/pwa.ts): имя кэша, файлы оболочки, слова уведомлений. */
export type WorkerConfig = { cacheName: string; shell: string[]; strings: PushStrings }

/** Слово воркера странице: «открой этот экран» (нажали уведомление, окно уже открыто). */
export type OpenScreenMessage = { k: 'aw-open'; url: string }

export const OPEN_SCREEN = 'aw-open'

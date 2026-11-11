import { parseRoute } from '../lib/routes'
import { openPush } from '../push/push-open'
import { shownPush } from '../push/push-text'
import type { MachineRecord } from '../remote/keystore'
import type {
  WorkerScope,
  WorkerConfig,
  PushEventLike,
  FetchEventLike,
  OpenScreenMessage,
  NotificationClickLike,
} from './sw.types'
import { OPEN_SCREEN } from './sw.types'

/**
 * Сервис-воркер телефонного клиента: оболочка для работы без сети и уведомления. Кэшируется
 * только оболочка: сокет к релею и его адреса (/v1, /healthz, /privacy) воркер не трогает.
 * Секрет пары живёт во фрагменте адреса, а фрагмент браузер в запрос не кладёт никогда - в
 * кэш он не попадёт по построению.
 *
 * Пуш открывается ключами пары из IndexedDB (push-open.ts): релей и служба пушей текста не
 * видят. Каждый пуш показывает уведомление - и тот, что не открылся: пуш без уведомления
 * браузер считает тихим и отбирает разрешение (Safari - после нескольких).
 */

export type WorkerDeps = {
  /** Пары телефона - из того же IndexedDB, что у страницы. */
  machines: () => Promise<readonly MachineRecord[]>
}

const BYPASS = /^\/(v1\/|healthz|privacy)/

const ICON = '/icons/icon-192.png'

/** Куда можно вести нажатие: только свой экран, известный роутеру, - не чужой адрес. */
export const safeScreenUrl = (url: unknown): string =>
  typeof url === 'string' && url.startsWith('/') && parseRoute(url).name !== 'notFound' ? url : '/'

export const installServiceWorker = (
  scope: WorkerScope,
  config: WorkerConfig,
  deps: WorkerDeps,
): void => {
  const shellPaths = new Set(config.shell)

  scope.addEventListener('install', (event) => {
    event.waitUntil(
      caches
        .open(config.cacheName)
        .then((cache) => cache.addAll(config.shell))
        .then(() => scope.skipWaiting()),
    )
  })

  scope.addEventListener('activate', (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith('aw-phone-') && key !== config.cacheName)
              .map((key) => caches.delete(key)),
          ),
        )
        .then(() => scope.clients.claim()),
    )
  })

  scope.addEventListener('fetch', (event: FetchEventLike) => {
    const { request } = event

    if (request.method !== 'GET') return

    const url = new URL(request.url)

    if (url.origin !== scope.location.origin || BYPASS.test(url.pathname)) return

    // Страница - из сети (релей отдаёт её без кэша), без сети - оболочка из кэша.
    if (request.mode === 'navigate') {
      event.respondWith(fetch(request).catch(() => caches.match('/index.html')))

      return
    }

    if (shellPaths.has(url.pathname)) {
      event.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(request)))
    }
  })

  scope.addEventListener('push', (event: PushEventLike) => {
    event.waitUntil(showPush(scope, config, deps, event))
  })

  scope.addEventListener('notificationclick', (event: NotificationClickLike) => {
    event.notification.close()

    const data = event.notification.data as { url?: unknown } | null

    event.waitUntil(openScreen(scope, safeScreenUrl(data?.url)))
  })
}

/** Открыть пуш и показать уведомление; что-то сломалось - общее слово, но показать всегда. */
export const showPush = async (
  scope: WorkerScope,
  config: WorkerConfig,
  deps: WorkerDeps,
  event: PushEventLike,
): Promise<void> => {
  const opened = await openedFrom(event, deps).catch(() => null)

  const shown = shownPush(opened, config.strings)

  await scope.registration.showNotification(shown.title, {
    body: shown.body,
    tag: shown.tag,
    icon: ICON,
    badge: ICON,
    renotify: true,
    data: { url: shown.url },
  })
}

const openedFrom = async (event: PushEventLike, deps: WorkerDeps) => {
  const payload = event.data ? new Uint8Array(event.data.arrayBuffer()) : null

  return payload ? openPush(payload, await deps.machines()) : null
}

/**
 * Нажали уведомление: открытое окно приложения - на передний план, и оно само переходит на экран
 * (без перезагрузки, линия с IDE остаётся); окна нет - открыть сразу на нужном экране.
 */
const openScreen = async (scope: WorkerScope, url: string): Promise<void> => {
  const windows = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const own = windows.find((one) => new URL(one.url).origin === scope.location.origin)

  if (!own) {
    await scope.clients.openWindow(url)

    return
  }

  own.postMessage({ k: OPEN_SCREEN, url } satisfies OpenScreenMessage)
  await own.focus()
}

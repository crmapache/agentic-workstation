/**
 * Сервис-воркер телефонного клиента - текстом при сборке: список оболочки (страница, сборка,
 * значки) известен только после неё. Кэшируется только оболочка: сокет к релею и его адреса
 * (/v1, /healthz, /privacy) воркер не трогает. Секрет пары живёт во фрагменте адреса, а
 * фрагмент браузер в запрос не кладёт никогда - в кэш он не попадёт по построению.
 *
 * push и notificationclick - шов под уведомления: пока их никто не подписывает (релей говорит
 * push: false), они молчат. Содержимое пуша будет запечатано - воркер показывает общее слово.
 */
export const serviceWorkerSource = (input: {
  cacheName: string
  shell: string[]
  push: { title: string; body: string }
}): string => `// Сборка apps/phone: build/service-worker.ts. Руками не править.
const CACHE = ${JSON.stringify(input.cacheName)}
const SHELL = ${JSON.stringify(input.shell)}
const SHELL_PATHS = new Set(SHELL)
const PUSH = ${JSON.stringify(input.push)}
const BYPASS = /^\\/(v1\\/|healthz|privacy)/

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('aw-phone-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (url.origin !== self.location.origin || BYPASS.test(url.pathname)) return

  // Страница - из сети (релей отдаёт её без кэша), без сети - оболочка из кэша.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')))

    return
  }

  if (SHELL_PATHS.has(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then((hit) => hit || fetch(request)))
  }
})

self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification(PUSH.title, {
      body: PUSH.body,
      icon: '/icons/icon-192.png',
      tag: 'agentic-workstation',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => (windows[0] ? windows[0].focus() : self.clients.openWindow('/'))),
  )
})
`

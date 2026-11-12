/**
 * Заголовки страниц релея. Телефонный клиент раздаётся отсюда же, и он держит ключи пары: всё,
 * что не нужно сборке Vite, закрыто. Скрипты, стили, шрифты и воркер - только свои; картинки -
 * свои и снятые камерой (blob:, data:); сокет - только к этому же хосту; в чужую рамку
 * страницу не вставить; камера - только самой странице (телефон снимает фото к сообщению).
 */

const HOST_PATTERN = /^[a-z0-9.-]+(:\d{1,5})?$/i

const LOOPBACK = new Set(['localhost', '127.0.0.1'])

/**
 * Сокет к своему хосту - явно: `'self'` в connect-src покрывает wss того же хоста не во всех
 * браузерах. Хост берётся из запроса и проверяется по форме: кривой не попадает в политику.
 */
const socketSource = (host: string | undefined): string => {
  if (!host || !HOST_PATTERN.test(host)) return ''

  const name = host.replace(/:\d+$/, '').toLowerCase()

  return ` ${LOOPBACK.has(name) ? 'ws' : 'wss'}://${host.toLowerCase()}`
}

export const contentSecurityPolicy = (host: string | undefined): string =>
  [
    "default-src 'self'",
    "script-src 'self'",
    `connect-src 'self'${socketSource(host)}`,
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ')

/** Всё, что отдаётся страницей или её файлом: политика, без реферера, только HTTPS, камера своя. */
export const pageHeaders = (host: string | undefined): Record<string, string> => ({
  'content-security-policy': contentSecurityPolicy(host),
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
  'x-content-type-options': 'nosniff',
})

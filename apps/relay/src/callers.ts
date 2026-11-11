import type { IncomingMessage } from 'node:http'

/**
 * Кто звонит и откуда - насколько релей может это честно сказать.
 */

/** Ответ, когда сказать, кто звонит, честно нельзя. */
export const ANONYMOUS = ''

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/**
 * Может ли страница с этого источника открыть сокет. Проходят три случая: запрос без Origin
 * (это IDE - она не браузер), страница с того же хоста, что и релей (обычный случай: релей
 * раздаёт телефонный клиент), и источник из RELAY_ALLOWED_ORIGINS. Плюс разработка на одной
 * машине: страница с localhost на другом порту к релею на localhost.
 */
export const originAllowed = (request: IncomingMessage, allowed: readonly string[]): boolean => {
  const origin = request.headers.origin

  if (!origin) return true

  let host: string
  let hostname: string

  try {
    const url = new URL(origin)

    host = url.host
    hostname = url.hostname.toLowerCase()
  } catch {
    return false
  }

  if (allowed.includes(origin)) return true
  if (host === request.headers.host) return true

  const served = String(request.headers.host ?? '')
    .replace(/:\d+$/, '')
    .toLowerCase()

  return LOOPBACK.has(hostname) && LOOPBACK.has(served)
}

/** Мог ли адрес прийти снаружи локальной сети. */
const routable = (address: string): boolean => {
  if (address === '::1' || address.startsWith('127.')) return false
  if (address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80'))
    return false
  if (
    address.startsWith('10.') ||
    address.startsWith('192.168.') ||
    address.startsWith('169.254.')
  ) {
    return false
  }

  const second = Number(address.split('.')[1] ?? -1)

  return !(address.startsWith('172.') && second >= 16 && second <= 31)
}

/**
 * Адрес звонящего для счёта соединений. За прокси (trustProxy) - последняя запись
 * X-Forwarded-For: её дописал ближайший прокси, всё левее написал сам звонящий. Без прокси
 * адрес из локальной сети - «не знаю»: это прокси, не назвавший, за кого говорит, и счёт всех
 * в одну корзину отказывал бы тридцать третьему человеку на земле. IPv6 считается сетью /64:
 * у одного человека их целая сеть.
 */
export const clientIp = (
  request: IncomingMessage,
  remoteAddress: string | undefined,
  trustProxy: boolean,
): string => {
  const forwarded = trustProxy
    ? String(request.headers['x-forwarded-for'] ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    : []
  const claimed = forwarded.at(-1)
  const peer = (remoteAddress ?? '').replace(/^::ffff:/, '')
  const address = (claimed ?? peer).replace(/^::ffff:/, '').toLowerCase()

  if (!address) return ANONYMOUS
  if (!claimed && !routable(address)) return ANONYMOUS
  if (address.includes(':')) return address.split(':').slice(0, 4).join(':')

  return address
}

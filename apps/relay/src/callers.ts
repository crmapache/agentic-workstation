import type { IncomingMessage } from 'node:http'
import { isIP } from 'node:net'

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

/** Адрес без скобок, зоны и обёртки IPv4-в-IPv6, в нижнем регистре: так его сравнивают и считают. */
const plain = (address: string): string =>
  address
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/%.*$/, '')
    .replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '')

/**
 * IPv6 целиком - восемь групп по четыре знака. Сжатая запись («2001:db8::1») и хвост IPv4
 * («64:ff9b::1.2.3.4») раскрываются: иначе первые четыре «группы» строки - не сеть /64, и один
 * человек с разными записями своей сети попадал бы в разные корзины.
 */
export const expandIpv6 = (address: string): string[] | null => {
  const ip = plain(address)

  if (isIP(ip) !== 6) return null

  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip)
  const [a = 0, b = 0, c = 0, d = 0] = v4 ? v4.slice(1).map(Number) : []
  const text = v4
    ? `${ip.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
    : ip
  const [head = '', tail] = text.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]

  return groups.length === 8 ? groups.map((group) => group.padStart(4, '0')) : null
}

const privateV4 = (address: string): boolean => {
  const [a = -1, b = -1] = address.split('.').map(Number)

  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  )
}

/**
 * Адрес из своей сети: петля, частные сети, link-local (и их IPv6: ::1, fc00::/7, fe80::/10).
 * Только такому ближнему собеседнику верится X-Forwarded-For: это прокси рядом (Traefik в
 * докер-сети Coolify), а не человек из интернета, дописавший заголовок сам. CGNAT (100.64/10)
 * сюда не входит: из него звонят и снаружи (Tailscale).
 */
export const isPrivateAddress = (address: string): boolean => {
  const ip = plain(address)

  if (isIP(ip) === 4) return privateV4(ip)

  const first = expandIpv6(ip)?.[0]

  if (!first) return false

  return ip === '::1' || /^f[cd]/.test(first) || /^fe[89ab]/.test(first)
}

/** Корзина счёта: IPv4 - сам адрес, IPv6 - сеть /64 (у одного человека их целая сеть). */
const bucketOf = (address: string): string =>
  isIP(address) === 6 ? (expandIpv6(address)?.slice(0, 4).join(':') ?? address) : address

/** Последняя запись X-Forwarded-For: её дописал ближайший прокси, всё левее написал звонящий. */
const lastForwarded = (request: IncomingMessage): string =>
  String(request.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1) ?? ''

/**
 * Адрес звонящего для счёта соединений. X-Forwarded-For читается, только если прокси включён
 * (trustProxy) и ближний собеседник из своей сети: иначе любой звонящий дописал бы заголовок и
 * назвался кем угодно, обойдя потолок соединений. Без прокси адрес из своей сети - «не знаю»:
 * это прокси, не назвавший, за кого говорит, и счёт всех в одну корзину отказывал бы
 * тридцать третьему человеку на земле.
 */
export const clientIp = (
  request: IncomingMessage,
  remoteAddress: string | undefined,
  trustProxy: boolean,
): string => {
  const peer = plain(remoteAddress ?? '')
  const claimed = trustProxy && isPrivateAddress(peer) ? plain(lastForwarded(request)) : ''

  if (isIP(claimed)) return bucketOf(claimed)
  if (!isIP(peer) || isPrivateAddress(peer)) return ANONYMOUS

  return bucketOf(peer)
}

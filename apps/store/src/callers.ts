import type { IncomingMessage } from 'node:http'
import { isIP } from 'node:net'

const plain = (address: string): string =>
  address
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/%.*$/, '')
    .replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '')

/** Адрес из частной сети: так приходит прокси Coolify, а не человек из интернета. */
const isPrivate = (address: string): boolean =>
  /^(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(address) ||
  address === '::1' ||
  address.startsWith('fc') ||
  address.startsWith('fd')

/**
 * Кто звонит - для пределов частоты. За прокси (trustProxy) верим первому адресу X-Forwarded-For,
 * только если сам собеседник из частной сети: иначе любой назвался бы кем угодно.
 */
export const clientIp = (request: IncomingMessage, trustProxy: boolean): string => {
  const direct = plain(request.socket.remoteAddress ?? '')

  if (!trustProxy || !isPrivate(direct)) return direct

  const forwarded = String(request.headers['x-forwarded-for'] ?? '')
    .split(',')[0]
    ?.trim()

  return forwarded && isIP(plain(forwarded)) ? plain(forwarded) : direct
}

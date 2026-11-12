import { toBase64Url, fromBase64Url } from './base64'
import { QR_SECRET_BYTES } from './crypto-spec'
import { ADDRESS_PATTERN } from './frame'

/**
 * Адрес за QR пары. Телефон открывает его камерой: страница клиента на релее, а всё важное -
 * после «#»: фрагмент браузер серверу не шлёт никогда, и секрет не попадёт в журналы релея.
 * Ключ IDE - отпечатком: сам ключ придёт через релей, телефон сверит его с этим.
 *
 * `https://<релей>/pair#aw1.<agentId>.<секрет base64url>.<отпечаток без пробелов>`
 *
 * Приставка `aw1` - формат этой IDE: телефонный клиент ACC такой код не примет за свой.
 */

export const PAIRING_PATH = '/pair'

export const PAIRING_SCHEME = 'aw1'

export type PairingCode = {
  /** Адрес IDE на релее, 22 знака base64url. */
  agentId: string
  secret: Uint8Array
  /** Отпечаток ключа IDE: 16 знаков hex заглавными, без пробелов. */
  fingerprint: string
}

/** Страница клиента на том же хосте, что и релей: wss → https, ws (localhost) → http. */
export const pageBaseOf = (relayUrl: string): string =>
  relayUrl
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://')
    .replace(/\/+$/, '')

/** Обратно: телефон, открытый со страницы релея, звонит на тот же хост. */
export const relayUrlOfPage = (origin: string): string =>
  origin
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://')
    .replace(/\/+$/, '')

export const pairingUrl = (relayUrl: string, code: PairingCode): string =>
  `${pageBaseOf(relayUrl)}${PAIRING_PATH}#${PAIRING_SCHEME}.${code.agentId}.${toBase64Url(
    code.secret,
  )}.${code.fingerprint.replaceAll(' ', '')}`

const FINGERPRINT = /^[0-9A-F]{16}$/

/** Фрагмент адреса (с «#» или без); null - не код этой IDE или испорчен. */
export const parsePairingFragment = (fragment: string): PairingCode | null => {
  const [scheme, agentId = '', secretText = '', fingerprint = '', ...rest] = fragment
    .replace(/^#/, '')
    .split('.')
  const secret = fromBase64Url(secretText)

  if (scheme !== PAIRING_SCHEME || rest.length > 0) return null
  if (!ADDRESS_PATTERN.test(agentId) || !FINGERPRINT.test(fingerprint)) return null
  if (!secret || secret.length !== QR_SECRET_BYTES) return null

  return { agentId, secret, fingerprint }
}

/** Отпечаток для глаз: четыре группы по четыре знака. */
export const groupFingerprint = (compact: string): string => compact.replace(/(.{4})(?!$)/g, '$1 ')

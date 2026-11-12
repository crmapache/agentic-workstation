import { createECDH } from 'node:crypto'

/**
 * Ключи VAPID (RFC 8292): ими релей подписывается перед службами пушей, а телефон, подписываясь
 * у своей службы, называет открытый ключ (applicationServerKey из /v1/info). Без них пуши
 * выключены: /v1/info говорит push: false, кадры FRAME_PUSH отбрасываются, и телефон кнопку
 * уведомлений не предлагает.
 *
 * Переменные: RELAY_VAPID_PUBLIC - открытый ключ P-256 без сжатия (65 байт) в base64url,
 * RELAY_VAPID_PRIVATE - закрытый d (32 байта) в base64url, RELAY_VAPID_SUBJECT - https-адрес
 * (или mailto:), по которому служба пушей найдёт хозяина релея.
 */

export type PushKeys = { publicKey: string; privateKey: string; subject: string }

type Env = Record<string, string | undefined>

const P256_PUBLIC_BYTES = 65

const P256_PRIVATE_BYTES = 32

const decoded = (text: string): Buffer | null =>
  /^[A-Za-z0-9_-]+$/.test(text) ? Buffer.from(text, 'base64url') : null

const subjectHolds = (subject: string): boolean => {
  try {
    const url = new URL(subject)

    return url.protocol === 'https:' || (url.protocol === 'mailto:' && url.pathname.includes('@'))
  } catch {
    return false
  }
}

/** Закрытый ключ даёт ровно этот открытый: перепутанная пара подписывала бы чужим ключом. */
const pairHolds = (publicKey: Buffer, privateKey: Buffer): boolean => {
  try {
    const ecdh = createECDH('prime256v1')

    ecdh.setPrivateKey(privateKey)

    return ecdh.getPublicKey().equals(publicKey)
  } catch {
    return false
  }
}

/**
 * Ключи из окружения или почему пушей нет - словами для строки журнала при старте. Сами ключи
 * в журнал не попадают никогда.
 */
export const readPushKeys = (env: Env): { push: PushKeys | null; pushOff: string } => {
  const publicText = env['RELAY_VAPID_PUBLIC']?.trim() ?? ''
  const privateText = env['RELAY_VAPID_PRIVATE']?.trim() ?? ''
  const subject = env['RELAY_VAPID_SUBJECT']?.trim() ?? ''

  if (!publicText && !privateText) return { push: null, pushOff: 'no VAPID keys' }

  const publicKey = decoded(publicText)
  const privateKey = decoded(privateText)

  if (publicKey?.length !== P256_PUBLIC_BYTES || publicKey[0] !== 0x04) {
    return { push: null, pushOff: 'RELAY_VAPID_PUBLIC is not an uncompressed P-256 key' }
  }

  if (privateKey?.length !== P256_PRIVATE_BYTES) {
    return { push: null, pushOff: 'RELAY_VAPID_PRIVATE is not a 32-byte P-256 key' }
  }

  if (!pairHolds(publicKey, privateKey)) {
    return { push: null, pushOff: 'the VAPID private key does not match the public one' }
  }

  if (!subjectHolds(subject)) {
    return { push: null, pushOff: 'RELAY_VAPID_SUBJECT is not an https: or mailto: address' }
  }

  return { push: { publicKey: publicText, privateKey: privateText, subject }, pushOff: '' }
}

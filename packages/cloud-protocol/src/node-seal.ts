import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

/**
 * Шифр записи облака (ADR 0102): AES-256-GCM ключом аккаунта, id записи - в доп. данных. Сервер
 * не прочтёт запись и не подменит одну другой: шифр, переложенный под чужой id, не откроется.
 * Формат blob - base64url от [версия 1 байт][nonce 12][шифр][метка 16].
 */

const VERSION = 1
const NONCE_BYTES = 12
const TAG_BYTES = 16

/** Запись шифром для сервера. */
export const sealRecord = (key: Buffer, id: string, text: string): string => {
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)

  cipher.setAAD(Buffer.from(id))

  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])

  return Buffer.concat([Buffer.from([VERSION]), nonce, body, cipher.getAuthTag()]).toString(
    'base64url',
  )
}

/** Запись из шифра; null - чужой ключ, чужой id или испорченный blob. */
export const openRecord = (key: Buffer, id: string, blob: string): string | null => {
  const bytes = Buffer.from(blob, 'base64url')

  if (bytes.length < 1 + NONCE_BYTES + TAG_BYTES || bytes[0] !== VERSION) return null

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(1, 1 + NONCE_BYTES))

    decipher.setAAD(Buffer.from(id))
    decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES))

    return Buffer.concat([
      decipher.update(bytes.subarray(1 + NONCE_BYTES, bytes.length - TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}

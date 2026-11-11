/**
 * Base64 и base64url без Buffer и без atob: пакет едет и в главный процесс IDE, и в телефон,
 * а там из общего есть только Uint8Array. Ключи (SPKI), доказательства пары и картинки
 * ходят обычным base64, адреса и секрет QR - base64url без «=».
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const lookup = (alphabet: string): Map<string, number> =>
  new Map([...alphabet].map((char, index) => [char, index]))

const STANDARD = lookup(ALPHABET)

const URL_SAFE = lookup(URL_ALPHABET)

const encodeWith = (bytes: Uint8Array, alphabet: string, pad: boolean): string => {
  let out = ''

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0
    const b = bytes[index + 1] ?? 0
    const c = bytes[index + 2] ?? 0
    const left = bytes.length - index

    out += alphabet[a >> 2]
    out += alphabet[((a & 3) << 4) | (b >> 4)]
    out += left > 1 ? alphabet[((b & 15) << 2) | (c >> 6)] : pad ? '=' : ''
    out += left > 2 ? alphabet[c & 63] : pad ? '=' : ''
  }

  return out
}

/** null - в тексте знак не из алфавита или длина, которой у base64 не бывает. */
const decodeWith = (text: string, table: Map<string, number>): Uint8Array | null => {
  const clean = text.replace(/=+$/, '')

  if (clean.length % 4 === 1) return null

  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let bits = 0
  let value = 0
  let at = 0

  for (const char of clean) {
    const digit = table.get(char)

    if (digit === undefined) return null

    value = (value << 6) | digit
    bits += 6

    if (bits >= 8) {
      bits -= 8
      out[at] = (value >> bits) & 0xff
      at += 1
    }
  }

  return out
}

export const toBase64 = (bytes: Uint8Array): string => encodeWith(bytes, ALPHABET, true)

export const fromBase64 = (text: string): Uint8Array | null => decodeWith(text, STANDARD)

export const toBase64Url = (bytes: Uint8Array): string => encodeWith(bytes, URL_ALPHABET, false)

export const fromBase64Url = (text: string): Uint8Array | null => decodeWith(text, URL_SAFE)

/** Похоже ли на base64 вообще: дешёвая проверка до разбора больших строк (картинок). */
export const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

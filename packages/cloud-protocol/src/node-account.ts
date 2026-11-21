import {
  hkdfSync,
  createHash,
  randomBytes,
  type KeyObject,
  createPublicKey,
  createPrivateKey,
} from 'node:crypto'

/**
 * Ключ аккаунта облака (ADR 0102): 32 случайных байта - единственное, что связывает IDE на
 * разных компьютерах с их общими записями. Из него выводятся ключ подписи (личность на сервере)
 * и ключ шифра (сервер видит только шифр). Человек видит ключ строкой из групп по пять знаков
 * Crockford base32 с контрольной суммой: опечатку при вводе видно сразу, а не пустым облаком.
 */

/** Секрет аккаунта и то, что из него выведено. */
export type CloudAccount = {
  /** 32 байта ключа аккаунта. */
  secret: Buffer
  /** Открытый ключ подписи - base64url 32 байт: адрес аккаунта на сервере. */
  publicKey: string
  /** Закрытый ключ подписи. */
  signingKey: KeyObject
  /** Ключ AES-256-GCM для записей. */
  sealKey: Buffer
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const SECRET_BYTES = 32
const CHECK_BYTES = 2
const GROUP = 5
const SALT = 'agentic-workstation/cloud/v1'
/** Начало PKCS#8 закрытого ключа Ed25519: за ним идут 32 байта зерна. */
const ED25519_PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex')

const derive = (secret: Buffer, info: string) =>
  Buffer.from(hkdfSync('sha256', secret, SALT, info, 32))

const checksum = (secret: Buffer) =>
  createHash('sha256').update(secret).digest().subarray(0, CHECK_BYTES)

const toBase32 = (bytes: Buffer): string => {
  let bits = 0
  let value = 0
  let out = ''

  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff
    bits += 8

    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]

  return out
}

const fromBase32 = (text: string): Buffer | null => {
  let bits = 0
  let value = 0
  const out: number[] = []

  for (const char of text) {
    const index = ALPHABET.indexOf(char)

    if (index < 0) return null

    value = ((value << 5) | index) & 0xffff
    bits += 5

    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  return Buffer.from(out)
}

/** Новый ключ аккаунта: 32 случайных байта. */
export const newAccountSecret = (): Buffer => randomBytes(SECRET_BYTES)

/** Ключ строкой для человека: группы по пять знаков через дефис. */
export const formatAccountKey = (secret: Buffer): string => {
  const text = toBase32(Buffer.concat([secret, checksum(secret)]))

  return text.match(new RegExp(`.{1,${GROUP}}`, 'g'))?.join('-') ?? text
}

/**
 * Ключ из строки человека: пробелы и дефисы не важны, регистр тоже, похожие буквы (I, L, O)
 * читаются как цифры. null - строка не ключ или контрольная сумма не сошлась.
 */
export const parseAccountKey = (text: string): Buffer | null => {
  const clean = text.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0')
  const bytes = fromBase32(clean)

  if (!bytes || bytes.length !== SECRET_BYTES + CHECK_BYTES) return null

  const secret = bytes.subarray(0, SECRET_BYTES)

  if (!checksum(secret).equals(bytes.subarray(SECRET_BYTES))) return null

  return Buffer.from(secret)
}

/** Ключи подписи и шифра из секрета аккаунта: на каждом компьютере выходят одни и те же. */
export const accountOf = (secret: Buffer): CloudAccount => {
  const signingKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8, derive(secret, 'sign')]),
    format: 'der',
    type: 'pkcs8',
  })
  const publicKey = String(createPublicKey(signingKey).export({ format: 'jwk' }).x)

  return { secret, publicKey, signingKey, sealKey: derive(secret, 'seal') }
}

/** Короткий id аккаунта для журнала и людей: начало отпечатка открытого ключа. */
export const accountIdOf = (publicKey: string): string =>
  createHash('sha256').update(publicKey).digest('base64url').slice(0, 12)

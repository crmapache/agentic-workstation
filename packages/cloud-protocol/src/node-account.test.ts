import { verify } from 'node:crypto'
import { createHash, createPublicKey } from 'node:crypto'

import { it, expect, describe } from 'vitest'

import {
  accountOf,
  accountIdOf,
  parseAccountKey,
  formatAccountKey,
  newAccountSecret,
} from './node-account.ts'
import { openRecord, sealRecord } from './node-seal.ts'
import { signedHeaders } from './node-signer.ts'
import { TIME, NONCE, SIGNATURE, signingText, CLOUD_HEADERS } from './signing.ts'

describe('ключ аккаунта', () => {
  it('строка читается обратно в тот же секрет', () => {
    const secret = newAccountSecret()
    const text = formatAccountKey(secret)

    expect(text).toMatch(/^([0-9A-Z]{5}-){10}[0-9A-Z]{5}$/)
    expect(parseAccountKey(text)?.equals(secret)).toBe(true)
  })

  it('пробелы, регистр и похожие буквы не мешают', () => {
    const secret = Buffer.alloc(32, 7)
    const text = formatAccountKey(secret)
    const messy = ` ${text.toLowerCase().replaceAll('-', ' ').replaceAll('1', 'l').replaceAll('0', 'o')} `

    expect(parseAccountKey(messy)?.equals(secret)).toBe(true)
  })

  it('опечатка ловится контрольной суммой', () => {
    const text = formatAccountKey(Buffer.alloc(32, 9))
    const typo = (text[0] === 'A' ? 'B' : 'A') + text.slice(1)

    expect(parseAccountKey(typo)).toBeNull()
    expect(parseAccountKey('not a key')).toBeNull()
    expect(parseAccountKey('')).toBeNull()
    expect(parseAccountKey(text.slice(0, -6))).toBeNull()
  })

  it('один секрет даёт одни ключи на любом компьютере, разные - разные', () => {
    const secret = Buffer.alloc(32, 1)
    const first = accountOf(secret)
    const again = accountOf(Buffer.from(secret))
    const other = accountOf(Buffer.alloc(32, 2))

    expect(again.publicKey).toBe(first.publicKey)
    expect(again.sealKey.equals(first.sealKey)).toBe(true)
    expect(other.publicKey).not.toBe(first.publicKey)
    expect(first.publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(first.sealKey.equals(first.secret)).toBe(false)
    expect(accountIdOf(first.publicKey)).toHaveLength(12)
  })
})

describe('шифр записи', () => {
  const key = accountOf(Buffer.alloc(32, 3)).sealKey

  it('открывается своим ключом под своим id', () => {
    const blob = sealRecord(key, 'card-1', '{"title":"Привет"}')

    expect(blob).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(openRecord(key, 'card-1', blob)).toBe('{"title":"Привет"}')
  })

  it('не открывается чужим ключом, под чужим id и после порчи', () => {
    const blob = sealRecord(key, 'card-1', 'text')
    const broken = Buffer.from(blob, 'base64url')

    broken[20] = (broken[20] ?? 0) ^ 1

    expect(openRecord(accountOf(Buffer.alloc(32, 4)).sealKey, 'card-1', blob)).toBeNull()
    expect(openRecord(key, 'card-2', blob)).toBeNull()
    expect(openRecord(key, 'card-1', broken.toString('base64url'))).toBeNull()
    expect(openRecord(key, 'card-1', 'AA')).toBeNull()
  })

  it('один текст дважды - разный шифр', () => {
    expect(sealRecord(key, 'a-record', 'same')).not.toBe(sealRecord(key, 'a-record', 'same'))
  })
})

describe('подпись запроса', () => {
  const account = accountOf(Buffer.alloc(32, 5))
  const publicKey = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: account.publicKey },
    format: 'jwk',
  })
  const request = { method: 'post', host: 'Cloud.Example:4464', path: '/v1/push', body: '{}' }
  const textFor = (headers: Record<string, string>, host: string) =>
    signingText({
      method: 'POST',
      host,
      path: '/v1/push',
      time: '1000',
      nonce: headers[CLOUD_HEADERS.nonce] ?? '',
      bodyHash: createHash('sha256').update('{}').digest('hex'),
    })
  const verifies = (headers: Record<string, string>, text: string) =>
    verify(
      null,
      Buffer.from(text),
      publicKey,
      Buffer.from(headers[CLOUD_HEADERS.signature] ?? '', 'base64url'),
    )

  it('сходится с открытым ключом аккаунта; хост - без учёта регистра', () => {
    const headers = signedHeaders(account, request, 1000)

    expect(headers[CLOUD_HEADERS.key]).toBe(account.publicKey)
    expect(headers[CLOUD_HEADERS.signature]).toMatch(SIGNATURE)
    expect(headers[CLOUD_HEADERS.nonce]).toMatch(NONCE)
    expect(headers[CLOUD_HEADERS.time]).toMatch(TIME)
    expect(verifies(headers, textFor(headers, 'cloud.example:4464'))).toBe(true)
  })

  it('подпись для одного хоста не подходит другому', () => {
    const headers = signedHeaders(account, request, 1000)

    expect(verifies(headers, textFor(headers, 'cloud.example'))).toBe(false)
    expect(verifies(headers, textFor(headers, 'mirror.example:4464'))).toBe(false)
  })
})

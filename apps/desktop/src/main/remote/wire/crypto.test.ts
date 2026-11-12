import { webcrypto } from 'node:crypto'

import { it, expect, describe } from 'vitest'

import { FRAME_PUSH, FRAME_SEALED } from '@agentic-workstation/remote-protocol/frame'

import {
  hkdf,
  open,
  seal,
  agree,
  agentProof,
  sameSecret,
  deviceProof,
  fingerprint,
  exportPublic,
  importPublic,
  deriveSession,
  longLivedAuth,
  resumeSession,
  generateKeyPair,
} from './crypto'
import { headerOf } from './frame'

/**
 * Половина IDE обязана совпасть с телефоном байт в байт, а телефон считает на WebCrypto.
 * Поэтому здесь телефонная сторона повторена на `crypto.subtle` - тем же API и тем же
 * порядком входов, - и обе стороны сверяются друг с другом и с векторами RFC 5869. Метки
 * телефона написаны здесь буквами, а не взяты из протокола: опечатка в общих константах
 * иначе совпала бы сама с собой.
 */

type PhoneKey = webcrypto.CryptoKey

const { subtle } = webcrypto
const text = new TextEncoder()
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')
const address = (fill: number) => new Uint8Array(16).fill(fill)

/** HKDF телефона: importKey('raw') + deriveBits({ name: 'HKDF' }). */
const phoneHkdf = async (salt: Uint8Array, ikm: Uint8Array, info: string, bytes: number) => {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: text.encode(info) },
    key,
    bytes * 8,
  )

  return new Uint8Array(bits)
}

/** Пара ECDH телефона; ключ на проводе - SPKI в base64. */
const phoneKeyPair = () =>
  subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])

const phoneExport = async (key: PhoneKey) =>
  Buffer.from(await subtle.exportKey('spki', key)).toString('base64')

const phoneImport = (spki: string) =>
  subtle.importKey(
    'spki',
    Buffer.from(spki, 'base64'),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  )

const phoneAgree = async (privateKey: PhoneKey, publicSpki: string) =>
  new Uint8Array(
    await subtle.deriveBits(
      { name: 'ECDH', public: await phoneImport(publicSpki) },
      privateKey,
      256,
    ),
  )

const phoneSalt = async (parts: string) =>
  new Uint8Array(await subtle.digest('SHA-256', text.encode(parts)))

const phoneMac = async (secret: Uint8Array, parts: string[]) => {
  const key = await subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const pieces = parts.flatMap((part) => [...text.encode(part), 0])

  return new Uint8Array(await subtle.sign('HMAC', key, new Uint8Array(pieces)))
}

const phoneNonce = (prefix: Uint8Array, counter: bigint) => {
  const out = new Uint8Array(12)

  out.set(prefix, 0)
  new DataView(out.buffer).setBigUint64(4, counter, false)

  return out
}

const phoneAes = (raw: Uint8Array, usage: 'encrypt' | 'decrypt') =>
  subtle.importKey('raw', raw, 'AES-GCM', false, [usage])

describe('HKDF по RFC 5869', () => {
  it('первый вектор', () => {
    const ikm = Buffer.alloc(22, 0x0b)
    const salt = Buffer.from('000102030405060708090a0b0c', 'hex')
    const info = Buffer.from('f0f1f2f3f4f5f6f7f8f9', 'hex')

    expect(hex(hkdf(salt, ikm, info, 42))).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    )
  })

  it('третий вектор - без соли, как долгий ключ пары', () => {
    expect(hex(hkdf(new Uint8Array(0), Buffer.alloc(22, 0x0b), '', 42))).toBe(
      '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8',
    )
  })
})

describe('пара и переподключение - как у телефона', () => {
  const pairing = async () => {
    const qrSecret = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(16)))
    const agentStatic = generateKeyPair()
    const agentEphemeral = generateKeyPair()
    const deviceStatic = await phoneKeyPair()
    const deviceEphemeral = await phoneKeyPair()
    const agentStaticPub = exportPublic(agentStatic.publicKey)
    const agentEphemeralPub = exportPublic(agentEphemeral.publicKey)
    const deviceStaticPub = await phoneExport(deviceStatic.publicKey)
    const deviceEphemeralPub = await phoneExport(deviceEphemeral.publicKey)
    const onAgent = deriveSession({
      staticSecret: agree(agentStatic.privateKey, importPublic(deviceStaticPub)!),
      ephemeralSecret: agree(agentEphemeral.privateKey, importPublic(deviceEphemeralPub)!),
      qrSecret,
      agentId: 'agent-1',
      deviceId: 'device-1',
      agentEphemeralPub,
      deviceEphemeralPub,
    })
    const staticSecret = await phoneAgree(deviceStatic.privateKey, agentStaticPub)
    const ikm = new Uint8Array([
      ...staticSecret,
      ...(await phoneAgree(deviceEphemeral.privateKey, agentEphemeralPub)),
      ...qrSecret,
    ])
    const salt = await phoneSalt(`agent-1|device-1|${agentEphemeralPub}|${deviceEphemeralPub}`)
    const onPhone = {
      fromAgent: await phoneHkdf(salt, ikm, 'aw/v1/agent-to-device', 32),
      toAgent: await phoneHkdf(salt, ikm, 'aw/v1/device-to-agent', 32),
      prefixFromAgent: await phoneHkdf(salt, ikm, 'aw/v1/nonce-a2d', 4),
      prefixToAgent: await phoneHkdf(salt, ikm, 'aw/v1/nonce-d2a', 4),
      auth: await phoneHkdf(new Uint8Array(0), staticSecret, 'aw/v1/auth', 32),
    }

    return { onAgent, onPhone, qrSecret, agentStaticPub, deviceStaticPub, deviceEphemeralPub }
  }

  it('обе стороны выводят одни и те же ключи', async () => {
    const { onAgent, onPhone } = await pairing()

    expect(hex(onAgent.toDevice)).toBe(hex(onPhone.fromAgent))
    expect(hex(onAgent.toAgent)).toBe(hex(onPhone.toAgent))
    expect(hex(onAgent.noncePrefixToDevice)).toBe(hex(onPhone.prefixFromAgent))
    expect(hex(onAgent.noncePrefixToAgent)).toBe(hex(onPhone.prefixToAgent))
    expect(hex(onAgent.auth)).toBe(hex(onPhone.auth))
  })

  it('что запечатала IDE, телефон открывает - и наоборот', async () => {
    const { onAgent, onPhone } = await pairing()
    const header = headerOf(FRAME_SEALED, address(1), address(2), 7n)
    const sealed = seal(
      onAgent.toDevice,
      onAgent.noncePrefixToDevice,
      7n,
      header,
      text.encode('hello'),
    )
    const opened = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: phoneNonce(onPhone.prefixFromAgent, 7n),
        additionalData: header,
        tagLength: 128,
      },
      await phoneAes(onPhone.fromAgent, 'decrypt'),
      sealed,
    )

    expect(Buffer.from(opened).toString()).toBe('hello')

    const back = new Uint8Array(
      await subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: phoneNonce(onPhone.prefixToAgent, 3n),
          additionalData: header,
          tagLength: 128,
        },
        await phoneAes(onPhone.toAgent, 'encrypt'),
        text.encode('answer'),
      ),
    )

    expect(open(onAgent.toAgent, onAgent.noncePrefixToAgent, 3n, header, back)?.toString()).toBe(
      'answer',
    )
  })

  it('кадр под чужим заголовком или видом не открывается', async () => {
    const { onAgent } = await pairing()
    const header = headerOf(FRAME_SEALED, address(1), address(2), 1n)
    const sealed = seal(onAgent.toDevice, onAgent.noncePrefixToDevice, 1n, header, text.encode('x'))
    const moved = headerOf(FRAME_SEALED, address(9), address(2), 1n)
    const relabelled = headerOf(FRAME_PUSH, address(1), address(2), 1n)

    expect(open(onAgent.toDevice, onAgent.noncePrefixToDevice, 1n, moved, sealed)).toBeNull()
    expect(open(onAgent.toDevice, onAgent.noncePrefixToDevice, 1n, relabelled, sealed)).toBeNull()
    expect(open(onAgent.toDevice, onAgent.noncePrefixToDevice, 2n, header, sealed)).toBeNull()
  })

  it('доказательства совпадают с HMAC телефона', async () => {
    const { qrSecret, agentStaticPub, deviceStaticPub, deviceEphemeralPub } = await pairing()
    const device = await phoneMac(qrSecret, [
      'aw-pair-v1',
      'agent-1',
      deviceStaticPub,
      deviceEphemeralPub,
      'device-1',
    ])
    const agent = await phoneMac(qrSecret, [
      'aw-pair-ack-v1',
      'agent-1',
      'device-1',
      agentStaticPub,
      'eph',
    ])

    expect(
      sameSecret(
        deviceProof(qrSecret, 'agent-1', deviceStaticPub, deviceEphemeralPub, 'device-1'),
        device,
      ),
    ).toBe(true)
    expect(
      sameSecret(agentProof(qrSecret, 'agent-1', 'device-1', agentStaticPub, 'eph'), agent),
    ).toBe(true)
  })

  it('переподключение без QR даёт те же ключи, что у телефона', async () => {
    const { onAgent, onPhone } = await pairing()
    const agentEphemeral = generateKeyPair()
    const deviceEphemeral = await phoneKeyPair()
    const agentPub = exportPublic(agentEphemeral.publicKey)
    const devicePub = await phoneExport(deviceEphemeral.publicKey)
    const resumed = resumeSession({
      auth: onAgent.auth,
      ephemeralSecret: agree(agentEphemeral.privateKey, importPublic(devicePub)!),
      agentId: 'agent-1',
      deviceId: 'device-1',
      agentEphemeralPub: agentPub,
      deviceEphemeralPub: devicePub,
    })
    const ikm = new Uint8Array([
      ...(await phoneAgree(deviceEphemeral.privateKey, agentPub)),
      ...onPhone.auth,
    ])
    const salt = await phoneSalt(`agent-1|device-1|${agentPub}|${devicePub}`)

    expect(hex(resumed.toDevice)).toBe(hex(await phoneHkdf(salt, ikm, 'aw/v1/agent-to-device', 32)))
    expect(hex(resumed.noncePrefixToAgent)).toBe(
      hex(await phoneHkdf(salt, ikm, 'aw/v1/nonce-d2a', 4)),
    )
    expect(hex(resumed.auth)).toBe(hex(onPhone.auth))
  })

  it('долгий ключ - из статического секрета и пустой соли', () => {
    const secret = Buffer.alloc(32, 7)

    expect(hex(longLivedAuth(secret))).toBe(hex(hkdf(Buffer.alloc(32), secret, 'aw/v1/auth', 32)))
  })
})

describe('метки - свои, не ACC', () => {
  it('ключи с метками amazing-claude-code не совпадают с нашими: телефон ACC эту IDE не прочтёт', async () => {
    const ikm = Buffer.alloc(32, 9)
    const salt = Buffer.alloc(32, 1)

    expect(hex(hkdf(salt, ikm, 'aw/v1/agent-to-device', 32))).not.toBe(
      hex(await phoneHkdf(salt, ikm, 'acc/v1/agent-to-device', 32)),
    )
    expect(
      sameSecret(
        deviceProof(Buffer.alloc(16, 3), 'agent-1', 'S', 'E', 'device-1'),
        await phoneMac(Buffer.alloc(16, 3), ['acc-pair-v1', 'agent-1', 'S', 'E', 'device-1']),
      ),
    ).toBe(false)
  })
})

describe('отпечаток и ключи', () => {
  it('отпечаток - четыре группы по четыре знака заглавными', () => {
    const pub = exportPublic(generateKeyPair().publicKey)

    expect(fingerprint(pub)).toMatch(/^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$/)
    expect(fingerprint(pub)).toBe(fingerprint(pub))
  })

  it('чужая кривая и мусор вместо ключа - null', () => {
    expect(importPublic('not a key')).toBeNull()
    expect(importPublic(Buffer.from('MCowBQYDK2VwAyEA', 'base64').toString('base64'))).toBeNull()
  })
})

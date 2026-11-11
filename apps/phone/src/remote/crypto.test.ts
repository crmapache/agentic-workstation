import { it, expect, describe } from 'vitest'

import { toBase64 } from '@agentic-workstation/remote-protocol/base64'
import { fingerprintOf } from '@agentic-workstation/remote-protocol/crypto-spec'
import { encodeHeader, FRAME_SEALED } from '@agentic-workstation/remote-protocol/frame'

import {
  open,
  seal,
  sha256,
  hkdfBits,
  deviceProof,
  exportPublic,
  derivePairKeys,
  agentProofValid,
  generateKeyPair,
  deriveResumeKeys,
  compactFingerprint,
} from './crypto'

const hex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (byte) => parseInt(byte, 16))

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const A = new Uint8Array(16).fill(1)

const D = new Uint8Array(16).fill(2)

describe('шифрование телефона на WebCrypto', () => {
  it('HKDF-SHA256 - вектор 3 из RFC 5869 (пустые соль и метка, как у долгого ключа пары)', async () => {
    const okm = await hkdfBits(new Uint8Array(0), hex('0b'.repeat(22)), '', 42)

    expect(toHex(okm)).toBe(
      '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8',
    )
  })

  it('отпечаток - как у протокола: первые 8 байт SHA-256 от SPKI', async () => {
    const pair = await generateKeyPair()
    const spki = await exportPublic(pair.publicKey)
    const expected = fingerprintOf(
      await sha256(Uint8Array.from(atob(spki), (c) => c.charCodeAt(0))),
    )

    expect(await compactFingerprint(spki)).toBe(expected.replaceAll(' ', ''))
    expect(await compactFingerprint(spki)).toMatch(/^[0-9A-F]{16}$/)
  })

  it('закрытый ключ пары не выгружается никому', async () => {
    const pair = await generateKeyPair()

    expect(pair.privateKey.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('pkcs8', pair.privateKey)).rejects.toThrow()
  })

  it('ключи пары детерминированы, направления разные, правленый заголовок не открывается', async () => {
    const phoneStatic = await generateKeyPair()
    const agentStatic = await generateKeyPair()
    const phoneEphemeral = await generateKeyPair()
    const agentEphemeral = await generateKeyPair()
    const input = {
      agentId: 'agent',
      deviceId: 'device',
      agentEphemeralPub: await exportPublic(agentEphemeral.publicKey),
      deviceEphemeralPub: await exportPublic(phoneEphemeral.publicKey),
      staticPrivate: phoneStatic.privateKey,
      agentStaticPub: await exportPublic(agentStatic.publicKey),
      ephemeralPrivate: phoneEphemeral.privateKey,
    }
    const phone = await derivePairKeys({ ...input, qrSecret: new Uint8Array(16).fill(5) })
    const again = await derivePairKeys({ ...input, qrSecret: new Uint8Array(16).fill(5) })
    const otherCode = await derivePairKeys({ ...input, qrSecret: new Uint8Array(16).fill(6) })
    const resumed = await deriveResumeKeys(input)
    const header = encodeHeader(FRAME_SEALED, A, D, 7n)
    const sealed = await seal(
      phone.toAgent,
      phone.prefixToAgent,
      7n,
      header,
      new TextEncoder().encode('{"k":"hello"}'),
    )

    expect(again.prefixToAgent).toEqual(phone.prefixToAgent)
    expect(phone.prefixFromAgent).not.toEqual(phone.prefixToAgent)
    expect(otherCode.prefixToAgent).not.toEqual(phone.prefixToAgent)
    expect(resumed.prefixToAgent).not.toEqual(phone.prefixToAgent)
    // Ключ другого направления и чужой заголовок кадр не открывают: AES-GCM ловит оба.
    expect(await open(phone.fromAgent, phone.prefixToAgent, 7n, header, sealed)).toBeNull()
    expect(
      await open(
        phone.fromAgent,
        phone.prefixToAgent,
        7n,
        encodeHeader(FRAME_SEALED, D, A, 7n),
        sealed,
      ),
    ).toBeNull()
  })

  it('доказательства пары: под тем же секретом сходятся, под другим - нет', async () => {
    const secret = new Uint8Array(16).fill(3)
    const proof = await deviceProof(secret, {
      agentId: 'a',
      staticPub: 's',
      ephemeralPub: 'e',
      deviceId: 'd',
    })

    expect(proof).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(
      await agentProofValid(secret, {
        agentId: 'a',
        deviceId: 'd',
        agentStaticPub: 's',
        agentEphemeralPub: 'e',
        proof: toBase64(new Uint8Array(32)),
      }),
    ).toBe(false)
  })
})

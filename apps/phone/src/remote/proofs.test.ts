import { it, expect, describe } from 'vitest'

import { toBase64, fromBase64Url } from '@agentic-workstation/remote-protocol/base64'
import {
  macInput,
  HKDF_INFO,
  REVOKED_LABEL,
  PAIR_REFUSED_LABEL,
} from '@agentic-workstation/remote-protocol/crypto-spec'
import { decodeFrame, FRAME_PROOF } from '@agentic-workstation/remote-protocol/frame'
import {
  claimInput,
  readProofBody,
  addressOfKeyHash,
} from '@agentic-workstation/remote-protocol/relay-claim'

import { agree, sha256, hkdfBits, exportPublic, generateKeyPair } from './crypto'
import { claimFrame, revokedTagValid, pairRefusedValid, newSigningIdentity } from './proofs'

const hmac = async (secret: Uint8Array, parts: string[]) =>
  toBase64(
    new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        await crypto.subtle.importKey(
          'raw',
          new Uint8Array(secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign'],
        ),
        new Uint8Array(macInput(parts)),
      ),
    ),
  )

describe('доказательства телефона', () => {
  it('адрес - начало SHA-256 ключа подписи, ответ на вызов - подпись над текстом входа', async () => {
    const identity = await newSigningIdentity()
    const address = fromBase64Url(identity.deviceId) ?? new Uint8Array()
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const frame = decodeFrame(await claimFrame(identity, address, challenge))
    const proof = readProofBody(frame.body)
    const key = await crypto.subtle.importKey(
      'spki',
      new Uint8Array(proof?.spki ?? []),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    const holds = (kind: 'agent' | 'device') =>
      crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        new Uint8Array(proof?.signature ?? []),
        new Uint8Array(claimInput(kind, identity.deviceId, challenge)),
      )

    expect(identity.signingKey.extractable).toBe(false)
    expect([...address]).toEqual([...addressOfKeyHash(await sha256(identity.signingSpki))])
    expect(frame.type).toBe(FRAME_PROOF)
    expect([...frame.from]).toEqual([...address])
    expect(await holds('device')).toBe(true)
    expect(await holds('agent')).toBe(false)
  })

  it('«тебя отпустили» - только с тегом под долгим ключом этой пары', async () => {
    const phone = await generateKeyPair()
    const ide = await generateKeyPair()
    const agentStaticPub = await exportPublic(ide.publicKey)
    const pair = { staticPrivateKey: phone.privateKey, agentStaticPub, agentId: 'A'.repeat(22) }
    // Долгий ключ - как его выводит IDE: HKDF с пустой солью от ECDH статических ключей.
    const auth = await hkdfBits(
      new Uint8Array(0),
      await agree(phone.privateKey, agentStaticPub),
      HKDF_INFO.auth,
      32,
    )
    const tag = await hmac(auth, [REVOKED_LABEL, pair.agentId, 'D'.repeat(22)])

    expect(await revokedTagValid(pair, 'D'.repeat(22), tag)).toBe(true)
    // Чужой телефон, чужой ключ, мусор - не правда.
    expect(await revokedTagValid(pair, 'E'.repeat(22), tag)).toBe(false)
    expect(await revokedTagValid(pair, 'D'.repeat(22), await hmac(new Uint8Array(32), []))).toBe(
      false,
    )
    expect(await revokedTagValid(pair, 'D'.repeat(22), '')).toBe(false)
  })

  it('«пару не пустили» - только под секретом открытого кода и с той же причиной', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(16))
    const proof = await hmac(secret, [
      PAIR_REFUSED_LABEL,
      'A'.repeat(22),
      'D'.repeat(22),
      'refused',
    ])
    const input = { agentId: 'A'.repeat(22), deviceId: 'D'.repeat(22), proof }

    expect(await pairRefusedValid(secret, { ...input, reason: 'refused' })).toBe(true)
    expect(await pairRefusedValid(secret, { ...input, reason: 'expired' })).toBe(false)
    expect(await pairRefusedValid(new Uint8Array(16), { ...input, reason: 'refused' })).toBe(false)
  })
})

import type { PairAck } from '@agentic-workstation/remote-protocol/agent-messages'
import type { PairingCode } from '@agentic-workstation/remote-protocol/pairing-url'
import type { PairInit } from '@agentic-workstation/remote-protocol/phone-messages'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'

import type { SessionKeys } from './crypto'
import {
  deviceProof,
  exportPublic,
  derivePairKeys,
  agentProofValid,
  generateKeyPair,
  compactFingerprint,
} from './crypto'
import type { MachineRecord } from './keystore'

/** Сколько ждать Approve человека: столько же живёт код в IDE (OFFER_LIFETIME_MS). */
export const PAIRING_PATIENCE_MS = 3 * 60_000

/** Длина имени телефона в списке IDE: дальше IDE режет сама. */
export const LABEL_MAX = 80

/**
 * Пара в пути: код из QR и ключи телефона для этой IDE. Статический закрытый ключ создаётся
 * сразу, при открытии экрана пары: его отпечаток человек сверяет с тем, что покажет IDE, ещё до
 * нажатия Pair.
 */
export type PairingOffer = {
  code: PairingCode
  relayUrl: string
  staticPair: CryptoKeyPair
  staticPub: string
  /** Отпечаток этого телефона - его IDE покажет рядом с Approve. */
  phoneFingerprint: string
  ephemeral: CryptoKeyPair
  ephemeralPub: string
}

/** Чем кончилась пара; ok - запись для хранилища и ключи соединения. */
export type PairOutcome =
  { ok: true; record: MachineRecord; keys: SessionKeys } | { ok: false; reason: PairFailure }

/**
 * proof - ответ IDE не под секретом из QR; fingerprint - ключ IDE не тот, что в QR (кто-то
 * между ними); keys - ключ IDE не P-256; timeout - Approve не пришёл; cancelled - человек
 * передумал; refused - в IDE нажали Refuse; expired - код истёк или его потратил другой
 * телефон (оба - словом IDE под секретом кода, а не догадкой по молчанию).
 */
export type PairFailure =
  'proof' | 'fingerprint' | 'keys' | 'timeout' | 'cancelled' | 'offline' | 'refused' | 'expired'

export const prepareOffer = async (code: PairingCode, relayUrl: string): Promise<PairingOffer> => {
  const staticPair = await generateKeyPair()
  const ephemeral = await generateKeyPair()
  const staticPub = await exportPublic(staticPair.publicKey)

  return {
    code,
    relayUrl,
    staticPair,
    staticPub,
    phoneFingerprint: await compactFingerprint(staticPub),
    ephemeral,
    ephemeralPub: await exportPublic(ephemeral.publicKey),
  }
}

/** Первый шаг пары: телефон доказывает, что видел QR, и приносит свои ключи. */
export const pairInitOf = async (
  offer: PairingOffer,
  deviceId: string,
  label: string,
): Promise<PairInit> => ({
  p: PROTOCOL_VERSION,
  k: 'pairInit',
  deviceId,
  label: label.trim().slice(0, LABEL_MAX),
  staticPub: offer.staticPub,
  ephemeralPub: offer.ephemeralPub,
  proof: await deviceProof(offer.code.secret, {
    agentId: offer.code.agentId,
    staticPub: offer.staticPub,
    ephemeralPub: offer.ephemeralPub,
    deviceId,
  }),
})

/**
 * Человек нажал Approve: ответ IDE проверяется доказательством под секретом QR и отпечатком из
 * QR - только тогда выводятся ключи пары. Секрет кода дальше этой функции не живёт.
 */
export const acceptPairAck = async (
  offer: PairingOffer,
  ack: PairAck,
  deviceId: string,
  now: number,
): Promise<PairOutcome> => {
  const { code } = offer
  const proofValid = await agentProofValid(code.secret, {
    agentId: code.agentId,
    deviceId,
    agentStaticPub: ack.staticPub,
    agentEphemeralPub: ack.ephemeralPub,
    proof: ack.proof,
  })

  if (!proofValid) return { ok: false, reason: 'proof' }
  if ((await compactFingerprint(ack.staticPub)) !== code.fingerprint) {
    return { ok: false, reason: 'fingerprint' }
  }

  try {
    const keys = await derivePairKeys({
      agentId: code.agentId,
      deviceId,
      agentEphemeralPub: ack.ephemeralPub,
      deviceEphemeralPub: offer.ephemeralPub,
      staticPrivate: offer.staticPair.privateKey,
      agentStaticPub: ack.staticPub,
      ephemeralPrivate: offer.ephemeral.privateKey,
      qrSecret: code.secret,
    })

    return {
      ok: true,
      keys,
      record: {
        agentId: code.agentId,
        relayUrl: offer.relayUrl,
        label: ack.label.trim() || code.agentId.slice(0, 6),
        agentStaticPub: ack.staticPub,
        fingerprint: code.fingerprint,
        staticPrivateKey: offer.staticPair.privateKey,
        staticPub: offer.staticPub,
        pairedAt: now,
        revoked: false,
      },
    }
  } catch {
    return { ok: false, reason: 'keys' }
  }
}

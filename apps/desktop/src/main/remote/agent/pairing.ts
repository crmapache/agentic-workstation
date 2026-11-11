import { randomBytes } from 'node:crypto'

import type { RemotePairing, RemotePending } from '@shared/remote'

import type { PairAck } from '@agentic-workstation/remote-protocol/agent-messages'
import { QR_SECRET_BYTES } from '@agentic-workstation/remote-protocol/crypto-spec'
import { pairingUrl } from '@agentic-workstation/remote-protocol/pairing-url'
import type { PairInit } from '@agentic-workstation/remote-protocol/phone-messages'

import type { KeyPair, SessionKeys } from '../wire/crypto'
import {
  agree,
  agentProof,
  sameSecret,
  deviceProof,
  fingerprint,
  exportPublic,
  importPublic,
  deriveSession,
  generateKeyPair,
} from '../wire/crypto'

/** Сколько код чего-то стоит: найти телефон хватает, забыть - тоже. */
export const OFFER_LIFETIME_MS = 3 * 60 * 1000

/**
 * Сколько помнить ответ уже спаренному телефону. Ответ мог потеряться (телефон ушёл из сети,
 * ящик релея протух), и телефон повторит ту же просьбу: он получит тот же ответ, а не «начни
 * заново» с ключами, которых у него нет.
 */
export const ANSWER_KEPT_MS = 10 * 60 * 1000

/** Неверный ответ код не сжигает (шум публичного релея), а серия - сжигает. */
export const MAX_ATTEMPTS = 5

type Offer = { secret: Buffer; expiresAt: number; attempts: number; used: boolean; url: string }

/** Телефон доказал, что видел код, и ждёт человека. Всё для ответа - уже здесь. */
export type PendingPairing = RemotePending & {
  keys: SessionKeys
  agentEphemeralPub: string
  proof: Buffer
  address: Buffer
  /** Просьба телефона как есть: её повтор после ответа узнаётся по ней. */
  init: PairInit
  /** Ждущий живёт, пока жив код, по которому он пришёл. */
  expiresAt: number
}

type Answered = { init: PairInit; reply: PairAck; until: number }

const sameInit = (first: PairInit, second: PairInit): boolean =>
  first.deviceId === second.deviceId &&
  first.staticPub === second.staticPub &&
  first.ephemeralPub === second.ephemeralPub &&
  sameSecret(Buffer.from(first.proof, 'base64'), Buffer.from(second.proof, 'base64'))

/**
 * Пара с телефоном. Код живёт только в памяти; первое верное доказательство тратит его, что бы
 * человек ни решил дальше, - иначе отказанный мог бы прийти с тем же кодом снова. Отпечаток
 * телефона человек сверяет глазами: доказательства мало против того, кто сфотографировал
 * экран и отсканировал первым.
 */
export class PairingDesk {
  private offer: Offer | null = null
  private waiting: PendingPairing | null = null
  private answered: Answered | null = null

  constructor(private readonly clock: () => number = Date.now) {}

  /** Предложить пару: новый код на три минуты. */
  start(relayUrl: string, agentId: string, identity: KeyPair): RemotePairing {
    const secret = randomBytes(QR_SECRET_BYTES)
    const expiresAt = this.clock() + OFFER_LIFETIME_MS
    const print = fingerprint(exportPublic(identity.publicKey))
    const url = pairingUrl(relayUrl, { agentId, secret, fingerprint: print })

    this.offer = { secret, expiresAt, attempts: 0, used: false, url }
    this.waiting = null

    return { url, expiresAt }
  }

  /** Код на экране сейчас - если он ещё чего-то стоит. */
  current(): RemotePairing | null {
    const offer = this.offer

    if (!offer || offer.used || this.clock() > offer.expiresAt) return null

    return { url: offer.url, expiresAt: offer.expiresAt }
  }

  /** Ждущий телефон - пока жив его код: истёк код - Approve уже ничего не пускает. */
  pending(): RemotePending | null {
    const waiting = this.live()

    return (
      waiting && {
        deviceId: waiting.deviceId,
        label: waiting.label,
        fingerprint: waiting.fingerprint,
      }
    )
  }

  /**
   * Телефон говорит, что видел код. Доказательство проверяется первым и за постоянное время.
   * true - телефон ждёт Approve человека.
   */
  take(init: PairInit, address: Buffer, agentId: string, identity: KeyPair): boolean {
    const offer = this.offer

    if (!offer || offer.used || this.clock() > offer.expiresAt) return false

    const expected = deviceProof(
      offer.secret,
      agentId,
      init.staticPub,
      init.ephemeralPub,
      init.deviceId,
    )

    if (!sameSecret(expected, Buffer.from(init.proof, 'base64'))) {
      offer.attempts += 1

      if (offer.attempts >= MAX_ATTEMPTS) this.offer = null

      return false
    }

    const deviceStatic = importPublic(init.staticPub)
    const deviceEphemeral = importPublic(init.ephemeralPub)

    if (!deviceStatic || !deviceEphemeral) return false

    const ephemeral = generateKeyPair()
    const agentEphemeralPub = exportPublic(ephemeral.publicKey)

    offer.used = true
    this.waiting = {
      deviceId: init.deviceId,
      label: init.label.trim().slice(0, 80) || 'A phone',
      fingerprint: fingerprint(init.staticPub),
      keys: deriveSession({
        staticSecret: agree(identity.privateKey, deviceStatic),
        ephemeralSecret: agree(ephemeral.privateKey, deviceEphemeral),
        qrSecret: offer.secret,
        agentId,
        deviceId: init.deviceId,
        agentEphemeralPub,
        deviceEphemeralPub: init.ephemeralPub,
      }),
      agentEphemeralPub,
      proof: agentProof(
        offer.secret,
        agentId,
        init.deviceId,
        exportPublic(identity.publicKey),
        agentEphemeralPub,
      ),
      address,
      init,
      expiresAt: offer.expiresAt,
    }

    return true
  }

  /**
   * Человек сказал «да» тому телефону, что видел в окне: адрес и отпечаток должны совпасть с
   * ждущим. Ждущий сменился (новый код, другой телефон) или код истёк - ничего не пускается.
   */
  approve(expected: { deviceId: string; fingerprint: string }): PendingPairing | null {
    const waiting = this.live()

    if (
      !waiting ||
      waiting.deviceId !== expected.deviceId ||
      waiting.fingerprint !== expected.fingerprint
    ) {
      return null
    }

    this.waiting = null
    this.offer = null

    return waiting
  }

  /** Ответ ушёл телефону: его же получит повтор той же просьбы. */
  answer(init: PairInit, reply: PairAck): void {
    this.answered = { init, reply, until: this.clock() + ANSWER_KEPT_MS }
  }

  /** Повтор уже отвеченной просьбы (ответ потерялся по дороге) - тот же ответ; иначе null. */
  repeatOf(init: PairInit): PairAck | null {
    const answered = this.answered

    if (!answered || this.clock() > answered.until) return null

    return sameInit(answered.init, init) ? answered.reply : null
  }

  /** Телефон отпустили: его повтор пары больше не получает ответ. */
  forget(deviceId: string): void {
    if (this.answered?.init.deviceId === deviceId) this.answered = null
  }

  /** «Нет» или «перестать предлагать»: код и ждущий - всё забыто. */
  cancel(): void {
    this.waiting = null
    this.offer = null
  }

  private live(): PendingPairing | null {
    if (this.waiting && this.clock() > this.waiting.expiresAt) this.waiting = null

    return this.waiting
  }
}

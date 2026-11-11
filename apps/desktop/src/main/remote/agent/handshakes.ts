import type { HandshakeReply } from '@agentic-workstation/remote-protocol/agent-messages'
import { decodeBody } from '@agentic-workstation/remote-protocol/body'
import type { PairInit } from '@agentic-workstation/remote-protocol/phone-messages'
import {
  parseHandshake,
  PROTOCOL_VERSION,
} from '@agentic-workstation/remote-protocol/phone-messages'

import type { RemoteStore } from '../store/remote-store'
import { agree, exportPublic, importPublic, resumeSession, generateKeyPair } from '../wire/crypto'
import type { DeviceSessions } from '../wire/device-sessions'
import type { Envelope } from '../wire/frame'
import { encodeAddress } from '../wire/frame'
import type { RemoteLimits } from './limits'
import type { PairingDesk } from './pairing'

/** Как часто телефону говорят «твои ключи не наши». */
const RESYNC_INTERVAL_MS = 5_000

export type HandshakeHost = {
  store: RemoteStore
  sessions: DeviceSessions
  pairing: PairingDesk
  limits: RemoteLimits
  /** Открытый кадр телефону: только ответ рукопожатия. */
  sendPlain: (address: Buffer, reply: HandshakeReply) => void
  /** Окну - перемены: ждущий телефон, «последний раз слышали». */
  onView: () => void
}

/**
 * Открытая часть разговора с телефоном - то, что идёт до ключей: просьба о паре, о новых
 * ключах, и ответы на них. От незнакомца больше ничего не читается.
 */
export class Handshakes {
  private readonly staleAsked = new Map<string, number>()
  /** Рукопожатие каждого телефона: тот же повтор получает тот же ответ, ключи не расходятся. */
  private readonly resumed = new Map<string, { devicePub: string; agentPub: string }>()

  constructor(private readonly host: HandshakeHost) {}

  /** Кадр того, с кем живых ключей нет: открытое рукопожатие или «начни заново». */
  stranger(envelope: Envelope, deviceId: string): void {
    const handshake = parseHandshake(decodeBody(envelope.body))

    if (handshake?.k === 'pairInit') return this.pairInit(envelope.from, deviceId, handshake)
    if (handshake?.k === 'sessionInit')
      return this.sessionInit(envelope.from, handshake.ephemeralPub)

    // Спаренный телефон стучит ключами, которых IDE после перезапуска не помнит: сказать
    // «начни заново» сразу, а не ждать, пока он сам решит, что линия мертва.
    if (!handshake && this.host.store.deviceSecret(deviceId))
      this.askForNewSession(envelope.from, deviceId)
  }

  /**
   * Кадр спаренного телефона не открылся: обычно отозванный или подменённый - но так выглядят
   * и переподключение, и повтор просьбы о паре, ответ на которую потерялся по дороге.
   */
  unreadable(envelope: Envelope, deviceId: string): void {
    const handshake = parseHandshake(decodeBody(envelope.body))

    if (handshake?.k === 'sessionInit')
      return this.sessionInit(envelope.from, handshake.ephemeralPub)
    if (handshake?.k === 'pairInit') return this.pairInit(envelope.from, deviceId, handshake)

    this.askForNewSession(envelope.from, deviceId)
  }

  forget(deviceId: string): void {
    this.staleAsked.delete(deviceId)
    this.resumed.delete(deviceId)
  }

  /**
   * Спаренный телефон вернулся: свежие эфемерные ключи, за которые ручается долгий. Кто это -
   * по адресу соединения (релей не даст выдать себя за другой адрес), а не по полю.
   */
  private sessionInit(address: Buffer, devicePub: string) {
    const deviceId = encodeAddress(address)
    const { store, sessions, limits } = this.host
    const auth = store.deviceSecret(deviceId)

    if (!auth) {
      // Отпущенному - сказать; незнакомцу - молчать: ответ подтвердил бы, что здесь кто-то есть.
      if (store.wasRevoked(deviceId) && limits.allow(deviceId, 'revoked')) {
        this.host.sendPlain(address, { p: PROTOCOL_VERSION, k: 'revoked' })
      }

      return
    }

    const repeated = this.resumed.get(deviceId)

    // Копия уже отвеченной просьбы (лежала в ящике релея) - тот же ответ, ключи не расходятся.
    if (repeated?.devicePub === devicePub && sessions.isOpen(deviceId)) {
      return this.host.sendPlain(address, {
        p: PROTOCOL_VERSION,
        k: 'sessionAck',
        ephemeralPub: repeated.agentPub,
        for: devicePub,
      })
    }

    const deviceKey = importPublic(devicePub)

    if (!deviceKey || !limits.allow(deviceId, 'sessionInit')) return

    const ephemeral = generateKeyPair()
    const agentPub = exportPublic(ephemeral.publicKey)
    const keys = resumeSession({
      auth,
      ephemeralSecret: agree(ephemeral.privateKey, deviceKey),
      agentId: store.agentId(),
      deviceId,
      agentEphemeralPub: agentPub,
      deviceEphemeralPub: devicePub,
    })

    // Предложены, а не поставлены: живые ключи работают, пока телефон не докажет новые.
    sessions.offer(deviceId, keys)
    this.resumed.set(deviceId, { devicePub, agentPub })
    this.host.sendPlain(address, {
      p: PROTOCOL_VERSION,
      k: 'sessionAck',
      ephemeralPub: agentPub,
      for: devicePub,
    })
    store.touch(deviceId, Date.now())
    this.host.onView()
  }

  /**
   * Просьба о паре. Повтор уже отвеченной (ответ потерялся, телефон спросил снова) - тот же
   * ответ; новая - к коду на экране и в ожидание человека.
   */
  private pairInit(address: Buffer, deviceId: string, init: PairInit) {
    // Доказательство считается по адресу соединения: поле, расходящееся с ним, - не этот телефон.
    if (init.deviceId !== deviceId) return

    const { store, pairing } = this.host
    const answer = pairing.repeatOf(init)

    if (answer) return this.host.sendPlain(address, answer)
    if (pairing.take(init, address, store.agentId(), store.identity())) this.host.onView()
  }

  /** «Твои ключи не наши - предложи новые»: открыто, с ограничением частоты. */
  private askForNewSession(address: Buffer, deviceId: string) {
    const now = Date.now()

    if (now - (this.staleAsked.get(deviceId) ?? 0) < RESYNC_INTERVAL_MS) return

    this.staleAsked.set(deviceId, now)
    this.host.sendPlain(address, { p: PROTOCOL_VERSION, k: 'sessionStale' })
  }
}

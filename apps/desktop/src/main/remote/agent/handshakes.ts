import type {
  PairRefusal,
  HandshakeReply,
} from '@agentic-workstation/remote-protocol/agent-messages'
import { decodeBody } from '@agentic-workstation/remote-protocol/body'
import type { PairInit } from '@agentic-workstation/remote-protocol/phone-messages'
import {
  parseHandshake,
  PROTOCOL_VERSION,
} from '@agentic-workstation/remote-protocol/phone-messages'

import type { RemoteStore } from '../store/remote-store'
import type { SessionKeys } from '../wire/crypto'
import {
  agree,
  exportPublic,
  importPublic,
  resumeSession,
  generateKeyPair,
  pairRefusedProof,
} from '../wire/crypto'
import type { DeviceSessions } from '../wire/device-sessions'
import type { Envelope } from '../wire/frame'
import { encodeAddress } from '../wire/frame'
import type { RemoteLimits } from './limits'
import type { PairingDesk } from './pairing'

/** Как часто телефону говорят «твои ключи не наши». */
const RESYNC_INTERVAL_MS = 5_000

/** Сколько отвеченных одноразовых ключей телефона помнить, чтобы не ответить на них снова. */
const USED_KEYS_KEPT = 16

export type HandshakeHost = {
  store: RemoteStore
  sessions: DeviceSessions
  pairing: PairingDesk
  limits: RemoteLimits
  /** Открытый кадр телефону: только ответ рукопожатия. */
  sendPlain: (address: Buffer, reply: HandshakeReply) => void
  /** Окну - перемены: ждущий телефон, «последний раз слышали». */
  onView: () => void
  /** Телефон встал ждать Approve: агенту - завести часы истечения его кода. */
  pendingStarted: (expiresAt: number) => void
}

/** Ответ на свежий ключ телефона: тот же ответ на его повтор, пока ключи не доказаны. */
type Resumed = { devicePub: string; agentPub: string; keys: SessionKeys; proven: boolean }

/**
 * Открытая часть разговора с телефоном - то, что идёт до ключей: просьба о паре, о новых
 * ключах, и ответы на них. От незнакомца больше ничего не читается.
 */
export class Handshakes {
  private readonly staleAsked = new Map<string, number>()
  private readonly resumed = new Map<string, Resumed>()
  /** Одноразовые ключи телефона, на которые уже ответили и которые больше не в ходу. */
  private readonly used = new Map<string, string[]>()

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

  /**
   * На ключах, выведенных из ответа, открылся кадр телефона: одноразовый ключ его просьбы
   * отслужил, и её копия больше не получает ответа (crypto-spec.ts).
   */
  proven(deviceId: string, keys: SessionKeys): void {
    const resumed = this.resumed.get(deviceId)

    if (resumed?.keys !== keys) return

    resumed.proven = true
    this.markUsed(deviceId, resumed.devicePub)
  }

  forget(deviceId: string): void {
    this.staleAsked.delete(deviceId)
    this.resumed.delete(deviceId)
    this.used.delete(deviceId)
  }

  /** «Пару не пустили» под секретом кода: телефон перестаёт ждать Approve. */
  refusePairing(address: Buffer, secret: Buffer, reason: PairRefusal): void {
    const deviceId = encodeAddress(address)

    this.host.sendPlain(address, {
      p: PROTOCOL_VERSION,
      k: 'pairRefused',
      reason,
      proof: pairRefusedProof(secret, this.host.store.agentId(), deviceId, reason).toString(
        'base64',
      ),
    })
  }

  /**
   * Спаренный телефон вернулся: свежие эфемерные ключи, за которые ручается долгий. Кто это -
   * по адресу соединения (релей не даст выдать себя за другой адрес), а не по полю.
   */
  private sessionInit(address: Buffer, devicePub: string) {
    const deviceId = encodeAddress(address)
    const { store, sessions, limits } = this.host
    const auth = store.deviceSecret(deviceId)

    if (!auth) return this.notPaired(address, deviceId)

    const repeated = this.resumed.get(deviceId)

    // Копия просьбы, ответ на которую ещё не доказан (лежала в ящике релея или ответ потерялся),
    // - тот же ответ, ключи не расходятся. Доказанный или уже сменённый ключ - чужая запись.
    if (repeated?.devicePub === devicePub && !repeated.proven && sessions.isOpen(deviceId)) {
      return this.host.sendPlain(address, {
        p: PROTOCOL_VERSION,
        k: 'sessionAck',
        ephemeralPub: repeated.agentPub,
        for: devicePub,
      })
    }

    if (this.wasUsed(deviceId, devicePub) || repeated?.devicePub === devicePub) return

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

    // Прежний ключ телефон бросил, раз прислал новый: его поздняя копия ответа не получит.
    if (repeated) this.markUsed(deviceId, repeated.devicePub)

    // Предложены, а не поставлены: живые ключи работают, пока телефон не докажет новые.
    sessions.offer(deviceId, keys)
    this.resumed.set(deviceId, { devicePub, agentPub, keys, proven: false })
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
   * Телефона среди спаренных нет. Отпущенному - «тебя отпустили» с тегом, который он может
   * проверить; без тега (ключ пары не открылся) и незнакомцу - молчать: ответ подтвердил бы, что
   * здесь кто-то есть, а слову без тега телефон всё равно не поверит.
   */
  private notPaired(address: Buffer, deviceId: string) {
    const tag = this.host.store.revokedTag(deviceId)

    if (tag && this.host.limits.allow(deviceId, 'revoked')) {
      this.host.sendPlain(address, { p: PROTOCOL_VERSION, k: 'revoked', tag })
    }
  }

  /**
   * Просьба о паре. Повтор уже отвеченной (ответ потерялся, телефон спросил снова) - тот же
   * ответ; новая - к коду на экране и в ожидание человека; к истёкшему или потраченному коду -
   * «истёк».
   */
  private pairInit(address: Buffer, deviceId: string, init: PairInit) {
    // Доказательство считается по адресу соединения: поле, расходящееся с ним, - не этот телефон.
    if (init.deviceId !== deviceId) return

    const { store, pairing } = this.host
    const answer = pairing.repeatOf(init)

    if (answer) return this.host.sendPlain(address, answer)

    const taken = pairing.take(init, address, store.agentId(), store.identity())

    if (taken?.kind === 'expired') return this.refusePairing(address, taken.secret, 'expired')
    if (taken?.kind !== 'waiting') return

    this.host.pendingStarted(taken.expiresAt)
    this.host.onView()
  }

  /** «Твои ключи не наши - предложи новые»: открыто, с ограничением частоты. */
  private askForNewSession(address: Buffer, deviceId: string) {
    const now = Date.now()

    if (now - (this.staleAsked.get(deviceId) ?? 0) < RESYNC_INTERVAL_MS) return

    this.staleAsked.set(deviceId, now)
    this.host.sendPlain(address, { p: PROTOCOL_VERSION, k: 'sessionStale' })
  }

  private wasUsed(deviceId: string, devicePub: string): boolean {
    return this.used.get(deviceId)?.includes(devicePub) ?? false
  }

  private markUsed(deviceId: string, devicePub: string) {
    const used = [...(this.used.get(deviceId) ?? []).filter((one) => one !== devicePub), devicePub]

    this.used.set(deviceId, used.slice(-USED_KEYS_KEPT))
  }
}

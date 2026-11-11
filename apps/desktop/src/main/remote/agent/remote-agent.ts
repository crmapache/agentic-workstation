import type { RemotePairing, RemotePending } from '@shared/remote'

import type {
  AgentMessage,
  HandshakeReply,
} from '@agentic-workstation/remote-protocol/agent-messages'
import { decodeBody, encodeBody } from '@agentic-workstation/remote-protocol/body'
import type { FrameType } from '@agentic-workstation/remote-protocol/frame'
import {
  FRAME_SEALED,
  FRAME_CONTROL,
  MAX_BODY_BYTES,
} from '@agentic-workstation/remote-protocol/frame'
import type { PairInit, PhoneMessage } from '@agentic-workstation/remote-protocol/phone-messages'
import {
  parseHandshake,
  PROTOCOL_VERSION,
  parsePhoneMessage,
} from '@agentic-workstation/remote-protocol/phone-messages'

import { RemoteOutbox } from '../link/outbox'
import type { SocketLike } from '../link/relay-link'
import { RelayLink } from '../link/relay-link'
import type { RemoteStore } from '../store/remote-store'
import { agree, exportPublic, importPublic, resumeSession, generateKeyPair } from '../wire/crypto'
import { DeviceSessions } from '../wire/device-sessions'
import type { Envelope } from '../wire/frame'
import { buildFrame, decodeAddress, encodeAddress } from '../wire/frame'
import { RemoteLimits } from './limits'
import { PairingDesk } from './pairing'
import { RemoteParts, mayArriveInParts } from './parts'

/** Телефон «на связи», если говорил недавно: дольше его стука (25 с). */
export const AWAKE_MS = 45_000

/** Как часто телефону говорят «твои ключи не наши». */
const RESYNC_INTERVAL_MS = 5_000

/** Что агенту нужно снаружи: хранилище, сокет и адрес релея. */
export type AgentCore = {
  store: RemoteStore
  createSocket: (url: string) => SocketLike
  relayUrl: string
  /** Как IDE зовёт себя в списке телефона: «Agentic Workstation on max-mbp». */
  label: () => string
  /** Окну - перемены: линия, пара, телефоны. */
  onView: () => void
}

/** Что агент отдаёт слою выше: слова телефона и перемены в его ключах. */
export type AgentHandlers = {
  handle: (deviceId: string, message: PhoneMessage) => void
  /** Ключи телефона начались заново или очередь до него обвалилась: посланное не считается полученным. */
  startedAgain: (deviceId: string) => void
  forgotten: (deviceId: string) => void
}

/**
 * Эта IDE снаружи: одна линия до релея, пары, рукопожатия, печать. Что пришло от спаренного
 * телефона и открылось, - наверх (handlers.handle); от незнакомца читается только просьба о
 * паре или о новых ключах.
 */
export class RemoteAgent {
  readonly outbox = new RemoteOutbox()
  readonly sessions = new DeviceSessions()
  readonly pairing = new PairingDesk()
  readonly limits = new RemoteLimits()
  private readonly parts = new RemoteParts()
  private readonly lastHeard = new Map<string, number>()
  private readonly resyncAsked = new Map<string, number>()
  /** Рукопожатие каждого телефона: тот же повтор получает тот же ответ, ключи не расходятся. */
  private readonly handshakes = new Map<string, { devicePub: string; agentPub: string }>()
  private link: RelayLink | null = null

  constructor(
    private readonly core: AgentCore,
    private readonly handlers: AgentHandlers,
  ) {}

  get linkState() {
    return this.link?.state ?? 'off'
  }

  get address(): Buffer {
    return decodeAddress(this.core.store.agentId())
  }

  start(): void {
    if (this.link) return

    this.link = new RelayLink({
      address: this.address,
      relayUrl: this.core.relayUrl,
      outbox: this.outbox,
      onFrame: (envelope) => this.receive(envelope),
      onState: () => this.core.onView(),
      createSocket: this.core.createSocket,
    })
    this.link.start()
  }

  stop(): void {
    this.link?.stop()
    this.link = null
    this.outbox.clear()
    this.pairing.cancel()
  }

  /** Сердцебиение и слив очереди - из одного места. */
  beat(): void {
    this.link?.checkAlive()
    this.flush()
  }

  flush(): void {
    this.link?.flush((deviceId) => this.resyncFrame(deviceId))
  }

  /** Телефоны на связи: ключи есть и слово от них было недавно. */
  onTheLine(): Set<string> {
    return new Set(this.sessions.openDevices().filter((id) => this.isAwake(id)))
  }

  isAwake(deviceId: string): boolean {
    return Date.now() - (this.lastHeard.get(deviceId) ?? 0) < AWAKE_MS
  }

  /** Запечатать телефону и в очередь; ключей нет или тело не влезает - отбросить. */
  queue(deviceId: string, body: Uint8Array, type: FrameType = FRAME_SEALED): boolean {
    if (body.length > MAX_BODY_BYTES) {
      console.warn(`[remote] тело в ${body.length} байт не влезает в кадр - выброшено`)

      return false
    }

    const sealed = this.sessions.seal(deviceId, decodeAddress(deviceId), this.address, body, type)

    if (!sealed) return false

    this.outbox.offer(deviceId, sealed)

    return true
  }

  /** Запечатанное слово телефону и слив очереди. */
  reply(deviceId: string, message: AgentMessage): void {
    if (this.queue(deviceId, encodeBody(message))) this.flush()
  }

  startPairing(): RemotePairing {
    const { store } = this.core

    return this.pairing.start(this.core.relayUrl, store.agentId(), store.identity())
  }

  pendingPairing(): RemotePending | null {
    return this.pairing.pending()
  }

  /** Человек сказал «да»: только теперь телефон узнаёт ключ IDE и может что-то открыть. */
  approvePairing(): void {
    const pending = this.pairing.approve()

    if (!pending) return

    const now = Date.now()
    const { store } = this.core
    const device = { id: pending.deviceId, label: pending.label, fingerprint: pending.fingerprint }

    this.sessions.open(pending.deviceId, pending.keys)
    store.remember({ ...device, pairedAt: now, lastSeenAt: now }, pending.keys.auth)
    this.sendPlain(pending.address, {
      p: PROTOCOL_VERSION,
      k: 'pairAck',
      agentId: store.agentId(),
      label: this.core.label(),
      staticPub: exportPublic(store.identity().publicKey),
      ephemeralPub: pending.agentEphemeralPub,
      proof: pending.proof.toString('base64'),
    })
  }

  refusePairing(): void {
    this.pairing.cancel()
  }

  /**
   * Отпустить телефон. Само отпускание - удаление секрета: кадры перестают открываться и при
   * выключенном телефоне. Сверху - запечатанное «тебя отпустили» тому, кто на связи, и
   * надгробие для того, кто вернётся позже.
   */
  revoke(deviceId: string): void {
    this.reply(deviceId, { p: PROTOCOL_VERSION, k: 'revoked' })
    this.sessions.close(deviceId)
    this.core.store.revoke(deviceId)

    for (const map of [this.lastHeard, this.resyncAsked, this.handshakes]) map.delete(deviceId)

    this.limits.forget(deviceId)
    this.parts.forget(deviceId)
    this.handlers.forgotten(deviceId)
  }

  private receive(envelope: Envelope) {
    // Слово самого релея - совет переспросить, не содержимое: телефон переспросит сам.
    if (envelope.type === FRAME_CONTROL) return

    const deviceId = encodeAddress(envelope.from)

    if (!this.sessions.isOpen(deviceId)) return this.stranger(envelope, deviceId)

    const opened = this.sessions.openFrame(deviceId, envelope)

    if (opened.kind === 'replayed') return

    if (opened.kind === 'unreadable') {
      // Не открылось: обычно отозванный или подменённый - но так выглядит и переподключение.
      const handshake = parseHandshake(decodeBody(envelope.body))

      if (handshake?.k === 'sessionInit')
        return this.sessionInit(envelope.from, handshake.ephemeralPub)

      return this.askForNewSession(envelope.from, deviceId)
    }

    this.lastHeard.set(deviceId, Date.now())

    if (opened.first) {
      this.handlers.startedAgain(deviceId)
      this.core.onView()
    }

    if (!this.limits.allowBytes(deviceId, opened.bytes.length)) {
      return console.warn('[remote] телефон шлёт больше своей доли - кадр отброшен')
    }

    this.deliver(deviceId, parsePhoneMessage(decodeBody(opened.bytes)))
  }

  /** Слово спаренного телефона: кусок - в сборку, остальное - через предел частоты наверх. */
  private deliver(deviceId: string, message: PhoneMessage | null) {
    if (!message) return
    if (message.k !== 'cmd' && !this.limits.allow(deviceId, message.k)) return
    if (message.k !== 'part') return this.handlers.handle(deviceId, message)

    const outcome = this.parts.take(deviceId, message)

    if (outcome.kind === 'refused') {
      console.warn('[remote] часть сообщения отклонена:', outcome.why)

      return this.reply(deviceId, {
        p: PROTOCOL_VERSION,
        k: 'notice',
        level: 'warning',
        code: 'partsRefused',
      })
    }

    if (outcome.kind === 'waiting') return

    const whole = decodeBody(Buffer.from(outcome.text, 'utf8'))
    const assembled = whole && mayArriveInParts(whole) ? parsePhoneMessage(whole) : null

    if (!assembled) return console.warn('[remote] частями пришло не сообщение')

    this.handlers.handle(deviceId, assembled)
  }

  /** Кадр того, с кем живых ключей нет: открытое рукопожатие или «начни заново». */
  private stranger(envelope: Envelope, deviceId: string) {
    const handshake = parseHandshake(decodeBody(envelope.body))

    if (handshake?.k === 'pairInit') return this.pairInit(envelope.from, deviceId, handshake)
    if (handshake?.k === 'sessionInit')
      return this.sessionInit(envelope.from, handshake.ephemeralPub)

    // Спаренный телефон стучит ключами, которых IDE после перезапуска не помнит: сказать
    // «начни заново» сразу, а не ждать, пока он сам решит, что линия мертва.
    if (!handshake && this.core.store.deviceSecret(deviceId))
      this.askForNewSession(envelope.from, deviceId)
  }

  /**
   * Спаренный телефон вернулся: свежие эфемерные ключи, за которые ручается долгий. Кто это -
   * по адресу соединения (релей не даст выдать себя за другой адрес), а не по полю.
   */
  private sessionInit(address: Buffer, devicePub: string) {
    const deviceId = encodeAddress(address)
    const { store } = this.core
    const auth = store.deviceSecret(deviceId)

    if (!auth) {
      // Отпущенному - сказать; незнакомцу - молчать: ответ подтвердил бы, что здесь кто-то есть.
      if (store.wasRevoked(deviceId) && this.limits.allow(deviceId, 'revoked')) {
        this.sendPlain(address, { p: PROTOCOL_VERSION, k: 'revoked' })
      }

      return
    }

    const repeated = this.handshakes.get(deviceId)

    // Копия уже отвеченной просьбы (лежала в ящике релея) - тот же ответ, ключи не расходятся.
    if (repeated?.devicePub === devicePub && this.sessions.isOpen(deviceId)) {
      return this.sendPlain(address, {
        p: PROTOCOL_VERSION,
        k: 'sessionAck',
        ephemeralPub: repeated.agentPub,
        for: devicePub,
      })
    }

    const deviceKey = importPublic(devicePub)

    if (!deviceKey || !this.limits.allow(deviceId, 'sessionInit')) return

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
    this.sessions.offer(deviceId, keys)
    this.handshakes.set(deviceId, { devicePub, agentPub })
    this.sendPlain(address, {
      p: PROTOCOL_VERSION,
      k: 'sessionAck',
      ephemeralPub: agentPub,
      for: devicePub,
    })
    store.touch(deviceId, Date.now())
    this.core.onView()
  }

  private pairInit(address: Buffer, deviceId: string, init: PairInit) {
    // Доказательство считается по адресу соединения: поле, расходящееся с ним, - не этот телефон.
    if (init.deviceId !== deviceId) return

    const { store } = this.core

    if (this.pairing.take(init, address, store.agentId(), store.identity())) this.core.onView()
  }

  /** «Твои ключи не наши - предложи новые»: открыто, с ограничением частоты. */
  private askForNewSession(address: Buffer, deviceId: string) {
    const now = Date.now()

    if (now - (this.resyncAsked.get(deviceId) ?? 0) < RESYNC_INTERVAL_MS) return

    this.resyncAsked.set(deviceId, now)
    this.sendPlain(address, { p: PROTOCOL_VERSION, k: 'sessionStale' })
  }

  /** Открытый кадр: только рукопожатие - ключа ещё нет, этот кадр его и даёт. */
  private sendPlain(address: Buffer, body: HandshakeReply) {
    this.outbox.offer(
      encodeAddress(address),
      buildFrame(FRAME_SEALED, address, this.address, 0n, encodeBody(body)),
    )
    this.flush()
  }

  /** Очередь телефона обвалилась: «переспроси со своего номера», запечатанное ему. */
  private resyncFrame(deviceId: string): Buffer | null {
    this.handlers.startedAgain(deviceId)

    return this.sessions.seal(
      deviceId,
      decodeAddress(deviceId),
      this.address,
      encodeBody({ p: PROTOCOL_VERSION, k: 'resync' } satisfies AgentMessage),
    )
  }
}

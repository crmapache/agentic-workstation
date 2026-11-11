import type { RemotePairing, RemotePending, RemoteLinkState } from '@shared/remote'

import type {
  AgentMessage,
  HandshakeReply,
} from '@agentic-workstation/remote-protocol/agent-messages'
import { encodeBody } from '@agentic-workstation/remote-protocol/body'
import {
  FRAME_SEALED,
  FRAME_CONTROL,
  MAX_BODY_BYTES,
  FRAME_PUSH_GONE,
} from '@agentic-workstation/remote-protocol/frame'
import type { PhoneMessage } from '@agentic-workstation/remote-protocol/phone-messages'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'
import type { PushSubscriptionWire } from '@agentic-workstation/remote-protocol/push'

import type { Lane, Seal, Outgoing } from '../link/outbox'
import { RemoteOutbox } from '../link/outbox'
import type { SocketLike } from '../link/relay-link'
import { RelayLink } from '../link/relay-link'
import type { RemoteStore } from '../store/remote-store'
import { claimProof, exportPublic } from '../wire/crypto'
import { DeviceSessions } from '../wire/device-sessions'
import type { Envelope } from '../wire/frame'
import { buildFrame, decodeAddress, encodeAddress } from '../wire/frame'
import { Handshakes } from './handshakes'
import { Inbound } from './inbound'
import { RemoteLimits } from './limits'
import type { PendingPairing } from './pairing'
import { PairingDesk } from './pairing'
import { PushOut } from './push-out'

/** Телефон «на связи», если говорил недавно: дольше его стука (25 с). */
export const AWAKE_MS = 45_000

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

/** Что агент отдаёт слою выше: слова телефона и перемены в его ключах и линии. */
export type AgentHandlers = {
  /** Слово телефона для моста: всё, кроме стука, «забудь меня» и кусков - их решает агент. */
  handle: (deviceId: string, message: PhoneMessage) => void
  /** Первый кадр на новых ключах телефона: новая страница (или вкладка) - подписки прежней ей чужие. */
  newKeys: (deviceId: string) => void
  /** Очередь до телефона обвалилась: посланное ему не считается полученным. */
  resend: (deviceId: string) => void
  /** Телефон молчал дольше «на связи» и заговорил: ему - что он пропустил, пока спал. */
  woke: (deviceId: string) => void
  /** Линия до релея поднялась снова: посланное в умерший сокет могло не дойти. */
  linkUp: () => void
  /** Команду с этим id мост уже принял: её повтор не тратит предел частоты. */
  knownCommand: (deviceId: string, commandId: string) => boolean
  forgotten: (deviceId: string) => void
  /** Подписка телефона на пуши появилась, сменилась или ушла (его слово или слово релея). */
  pushChanged: (deviceId: string) => void
}

/**
 * Эта IDE снаружи: одна линия до релея, пары, рукопожатия, печать. Что пришло от спаренного
 * телефона и открылось, - через пределы частоты наверх (handlers.handle); от незнакомца
 * читается только просьба о паре или о новых ключах (Handshakes).
 */
export class RemoteAgent {
  readonly outbox = new RemoteOutbox()
  readonly sessions = new DeviceSessions()
  readonly pairing = new PairingDesk()
  readonly limits = new RemoteLimits()
  readonly pushes: PushOut
  private readonly handshakes: Handshakes
  private readonly inbound: Inbound
  private readonly lastHeard = new Map<string, number>()
  private link: RelayLink | null = null
  private expiryTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly core: AgentCore,
    private readonly handlers: AgentHandlers,
  ) {
    this.handshakes = new Handshakes({
      store: core.store,
      sessions: this.sessions,
      pairing: this.pairing,
      limits: this.limits,
      sendPlain: (address, reply) => this.sendPlain(address, reply),
      onView: core.onView,
      pendingStarted: (expiresAt) => this.watchExpiry(expiresAt),
    })
    this.inbound = new Inbound({
      limits: this.limits,
      handlers,
      reply: (deviceId, message, lane) => this.reply(deviceId, message, lane),
      unpair: (deviceId) => {
        console.warn('[remote] телефон попросил его забыть - отзыв')
        this.revoke(deviceId)
        this.core.onView()
      },
      subscribe: (deviceId, subscription) => this.setPush(deviceId, subscription),
    })
    this.pushes = new PushOut({
      store: core.store,
      address: () => this.address,
      offer: (deviceId, frame) => {
        this.outbox.offerUrgent(deviceId, { frame })
        this.flush()
      },
    })
  }

  get linkState(): RemoteLinkState {
    return this.link?.state ?? 'off'
  }

  get address(): Buffer {
    return decodeAddress(this.core.store.agentId())
  }

  start(): void {
    if (this.link) return

    const address = this.address

    this.link = new RelayLink({
      address,
      relayUrl: this.core.relayUrl,
      prove: (challenge) => claimProof(this.core.store.signing(), 'agent', address, challenge),
      outbox: this.outbox,
      onFrame: (envelope) => this.receive(envelope),
      onState: (state) => this.linkMoved(state),
      createSocket: this.core.createSocket,
    })
    this.link.start()
  }

  /**
   * Погасить линию: ждущему пары - «не пустили», и всё ждущее уходит в сокет, пока он ещё
   * открыт, а не пропадает с ним.
   */
  stop(): void {
    this.refusePairing()
    this.flush()
    this.link?.stop()
    this.link = null
    this.outbox.clear()

    if (this.expiryTimer) clearTimeout(this.expiryTimer)

    this.expiryTimer = null
  }

  /** Сердцебиение и слив очереди - из одного места. */
  beat(): void {
    this.link?.checkAlive()
    this.limits.sweep()
    this.flush()
  }

  flush(): void {
    this.link?.flush(this.seal, (deviceId) => this.resyncFrame(deviceId))
  }

  /** Телефоны на связи: ключи есть и слово от них было недавно. */
  onTheLine(): Set<string> {
    return new Set(this.sessions.openDevices().filter((id) => this.isAwake(id)))
  }

  isAwake(deviceId: string): boolean {
    return Date.now() - this.heardAt(deviceId) < AWAKE_MS
  }

  /** Когда телефон говорил последний раз (часы IDE); 0 - не говорил с начала линии. */
  heardAt(deviceId: string): number {
    return this.lastHeard.get(deviceId) ?? 0
  }

  /** Тело телефону - в очередь; запечатается при отправке. Ключей нет или не влезает - false. */
  queue(deviceId: string, body: Uint8Array, lane: Lane = 'normal'): boolean {
    if (body.length > MAX_BODY_BYTES) {
      console.warn(`[remote] тело в ${body.length} байт не влезает в кадр - выброшено`)

      return false
    }

    if (!this.sessions.isOpen(deviceId)) return false

    const outgoing: Outgoing = { body, type: FRAME_SEALED }

    if (lane === 'urgent') this.outbox.offerUrgent(deviceId, outgoing)
    else this.outbox.offer(deviceId, outgoing)

    return true
  }

  /** Запечатанное слово телефону и слив очереди. */
  reply(deviceId: string, message: AgentMessage, lane: Lane = 'normal'): void {
    if (this.queue(deviceId, encodeBody(message), lane)) this.flush()
  }

  /** Новый код. Телефон, ждавший прежнего, ждёт уже не того - ему «истёк». */
  startPairing(): RemotePairing {
    const { store } = this.core

    this.refuse(this.pairing.cancel(), 'expired')

    return this.pairing.start(this.core.relayUrl, store.agentId(), store.identity())
  }

  pendingPairing(): RemotePending | null {
    return this.pairing.pending()
  }

  /**
   * Человек сказал «да» телефону, которого видел в окне: только теперь телефон узнаёт ключ
   * IDE и может что-то открыть. Ответ запоминается: потерянный, он уйдёт снова на повтор.
   */
  approvePairing(expected: { deviceId: string; fingerprint: string }): boolean {
    const pending = this.pairing.approve(expected)

    if (!pending) return false

    const now = Date.now()
    const { store } = this.core
    const device = { id: pending.deviceId, label: pending.label, fingerprint: pending.fingerprint }
    const ack: HandshakeReply & { k: 'pairAck' } = {
      p: PROTOCOL_VERSION,
      k: 'pairAck',
      agentId: store.agentId(),
      label: this.core.label(),
      staticPub: exportPublic(store.identity().publicKey),
      ephemeralPub: pending.agentEphemeralPub,
      proof: pending.proof.toString('base64'),
    }

    this.sessions.open(pending.deviceId, pending.keys)
    store.remember({ ...device, pairedAt: now, lastSeenAt: now }, pending.keys.auth)
    this.pairing.answer(pending.init, ack, pending.keys)
    this.sendPlain(pending.address, ack)

    return true
  }

  /** «Нет» ждущему (или перестать предлагать код): телефону - «не пустили», а не тишина. */
  refusePairing(): void {
    this.refuse(this.pairing.cancel(), 'refused')
  }

  /**
   * Отпустить телефон. Само отпускание - удаление секрета: кадры перестают открываться и при
   * выключенном телефоне. Сверху - запечатанное «тебя отпустили» тому, кто на связи (сейчас,
   * пока ключи есть), и надгробие для того, кто вернётся позже. Пределы частоты не обнуляются:
   * принятое до отзыва уже посчитано.
   */
  revoke(deviceId: string): void {
    // Тег считает хранилище, пока долгий ключ ещё есть: потом «тебя отпустили» не подписать.
    const tag = this.core.store.revoke(deviceId)
    const revoked = this.sessions.seal(
      deviceId,
      decodeAddress(deviceId),
      this.address,
      encodeBody({ p: PROTOCOL_VERSION, k: 'revoked', tag } satisfies AgentMessage),
    )

    this.outbox.forget(deviceId)
    if (revoked) this.outbox.offerUrgent(deviceId, { frame: revoked })
    this.flush()
    this.sessions.close(deviceId)
    this.lastHeard.delete(deviceId)
    this.handshakes.forget(deviceId)
    this.inbound.forget(deviceId)
    this.pairing.forget(deviceId)
    this.handlers.forgotten(deviceId)
  }

  private readonly seal: Seal = (deviceId, outgoing) =>
    'frame' in outgoing
      ? outgoing.frame
      : this.sessions.seal(
          deviceId,
          decodeAddress(deviceId),
          this.address,
          outgoing.body,
          outgoing.type,
        )

  /** Линия снова на релее: подписчикам - «переспроси», ждавшее - сразу, а не через такт. */
  private linkMoved(state: RemoteLinkState) {
    if (state === 'connected') {
      this.handlers.linkUp()
      this.flush()
    }

    this.core.onView()
  }

  private receive(envelope: Envelope) {
    if (envelope.type === FRAME_CONTROL) return this.relayLost(envelope)
    if (envelope.type === FRAME_PUSH_GONE) return this.pushGone(envelope)

    const deviceId = encodeAddress(envelope.from)

    if (!this.sessions.isOpen(deviceId)) return this.handshakes.stranger(envelope, deviceId)

    const opened = this.sessions.openFrame(deviceId, envelope)

    if (opened.kind === 'replayed') return
    if (opened.kind === 'unreadable') return this.handshakes.unreadable(envelope, deviceId)

    const wasAwake = this.isAwake(deviceId)

    this.lastHeard.set(deviceId, Date.now())

    if (opened.first) {
      // Ключи доказаны: одноразовый ключ, который их дал, больше не отвечается (crypto-spec.ts).
      this.handshakes.proven(deviceId, opened.keys)
      this.pairing.proven(deviceId, opened.keys)
      this.handlers.newKeys(deviceId)
    } else if (!wasAwake) this.handlers.woke(deviceId)

    if (opened.first || !wasAwake) this.core.onView()

    this.inbound.take(deviceId, opened.bytes)
  }

  /**
   * Слово релея: кадры от этого телефона к IDE пропали (ящик переполнился или протух, сокет IDE
   * умер молча). Что именно - не узнать, поэтому телефону - «переспроси со своего номера»:
   * подписки вернутся, а команда без ответа повторится тем же id и не выполнится дважды.
   */
  private relayLost(envelope: Envelope) {
    const deviceId = encodeAddress(envelope.from)

    if (envelope.from.equals(this.address) || !this.sessions.isOpen(deviceId)) return

    console.warn('[remote] релей сказал, что кадры телефона к IDE пропали - телефону «переспроси»')
    this.reply(deviceId, { p: PROTOCOL_VERSION, k: 'resync' })
  }

  /**
   * Подписка телефона на пуши: его слово pushSet или pushClear. Тот же адрес службы на каждой
   * новой линии - не перемена: ни записи на диск, ни новой точки отсчёта у уведомлений.
   */
  private setPush(deviceId: string, subscription: PushSubscriptionWire | null) {
    if (!this.core.store.setPush(deviceId, subscription)) return

    this.handlers.pushChanged(deviceId)
    this.core.onView()
  }

  /**
   * Слово релея: служба пушей этого телефона ответила «такой подписки нет» (браузер её снял,
   * PWA удалили) - дальше будить его нечем, пока он не пришлёт новую.
   */
  private pushGone(envelope: Envelope) {
    const deviceId = encodeAddress(envelope.from)

    if (!this.core.store.pushOf(deviceId)) return

    console.warn('[remote] служба пушей забыла подписку телефона - она снята')
    this.setPush(deviceId, null)
  }

  /** Телефону, которого не пустили, - слово под секретом его кода. */
  private refuse(pending: PendingPairing | null, reason: 'refused' | 'expired') {
    if (pending) this.handshakes.refusePairing(pending.address, pending.secret, reason)
  }

  /**
   * Часы ждущего: код истёк, а человек так и не решил - телефону «истёк», окну - что ждущего
   * больше нет. Без них телефон ждал бы Approve молча, пока не кончится его терпение.
   */
  private watchExpiry(expiresAt: number) {
    if (this.expiryTimer) clearTimeout(this.expiryTimer)

    this.expiryTimer = setTimeout(
      () => {
        this.expiryTimer = null
        this.refuse(this.pairing.takeExpired(), 'expired')
        this.core.onView()
      },
      Math.max(0, expiresAt - Date.now()) + 50,
    )
    this.expiryTimer.unref()
  }

  /** Открытый кадр: только рукопожатие - ключа ещё нет, этот кадр его и даёт. Срочно: его ждут. */
  private sendPlain(address: Buffer, body: HandshakeReply) {
    this.outbox.offerUrgent(encodeAddress(address), {
      frame: buildFrame(FRAME_SEALED, address, this.address, 0n, encodeBody(body)),
    })
    this.flush()
  }

  /** Очередь телефона обвалилась: «переспроси со своего номера», запечатанное ему. */
  private resyncFrame(deviceId: string): Buffer | null {
    this.handlers.resend(deviceId)

    return this.sessions.seal(
      deviceId,
      decodeAddress(deviceId),
      this.address,
      encodeBody({ p: PROTOCOL_VERSION, k: 'resync' } satisfies AgentMessage),
    )
  }
}

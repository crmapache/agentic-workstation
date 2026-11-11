import type { RemotePairing, RemotePending, RemoteLinkState } from '@shared/remote'

import type {
  AgentMessage,
  HandshakeReply,
} from '@agentic-workstation/remote-protocol/agent-messages'
import { decodeBody, encodeBody } from '@agentic-workstation/remote-protocol/body'
import {
  FRAME_SEALED,
  FRAME_CONTROL,
  MAX_BODY_BYTES,
} from '@agentic-workstation/remote-protocol/frame'
import type {
  CmdMessage,
  PartMessage,
  PhoneMessage,
} from '@agentic-workstation/remote-protocol/phone-messages'
import {
  PROTOCOL_VERSION,
  parsePhoneMessage,
} from '@agentic-workstation/remote-protocol/phone-messages'

import type { Lane, Seal, Outgoing } from '../link/outbox'
import { RemoteOutbox } from '../link/outbox'
import type { SocketLike } from '../link/relay-link'
import { RelayLink } from '../link/relay-link'
import type { RemoteStore } from '../store/remote-store'
import { exportPublic } from '../wire/crypto'
import { DeviceSessions } from '../wire/device-sessions'
import type { Envelope } from '../wire/frame'
import { buildFrame, decodeAddress, encodeAddress } from '../wire/frame'
import { Handshakes } from './handshakes'
import { limitKindOf, RemoteLimits } from './limits'
import { PairingDesk } from './pairing'
import { RemoteParts, mayArriveInParts } from './parts'

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
  private readonly parts = new RemoteParts()
  private readonly handshakes: Handshakes
  private readonly lastHeard = new Map<string, number>()
  private link: RelayLink | null = null

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

    this.link = new RelayLink({
      address: this.address,
      relayUrl: this.core.relayUrl,
      outbox: this.outbox,
      onFrame: (envelope) => this.receive(envelope),
      onState: (state) => this.linkMoved(state),
      createSocket: this.core.createSocket,
    })
    this.link.start()
  }

  /** Погасить линию: ждущее уходит в сокет, пока он ещё открыт, а не пропадает с ним. */
  stop(): void {
    this.flush()
    this.link?.stop()
    this.link = null
    this.outbox.clear()
    this.pairing.cancel()
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
    return Date.now() - (this.lastHeard.get(deviceId) ?? 0) < AWAKE_MS
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

  startPairing(): RemotePairing {
    const { store } = this.core

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
    this.pairing.answer(pending.init, ack)
    this.sendPlain(pending.address, ack)

    return true
  }

  refusePairing(): void {
    this.pairing.cancel()
  }

  /**
   * Отпустить телефон. Само отпускание - удаление секрета: кадры перестают открываться и при
   * выключенном телефоне. Сверху - запечатанное «тебя отпустили» тому, кто на связи (сейчас,
   * пока ключи есть), и надгробие для того, кто вернётся позже. Пределы частоты не обнуляются:
   * принятое до отзыва уже посчитано.
   */
  revoke(deviceId: string): void {
    const revoked = this.sessions.seal(
      deviceId,
      decodeAddress(deviceId),
      this.address,
      encodeBody({ p: PROTOCOL_VERSION, k: 'revoked' } satisfies AgentMessage),
    )

    this.outbox.forget(deviceId)
    if (revoked) this.outbox.offerUrgent(deviceId, { frame: revoked })
    this.flush()
    this.sessions.close(deviceId)
    this.core.store.revoke(deviceId)
    this.lastHeard.delete(deviceId)
    this.handshakes.forget(deviceId)
    this.parts.forget(deviceId)
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

    const deviceId = encodeAddress(envelope.from)

    if (!this.sessions.isOpen(deviceId)) return this.handshakes.stranger(envelope, deviceId)

    const opened = this.sessions.openFrame(deviceId, envelope)

    if (opened.kind === 'replayed') return
    if (opened.kind === 'unreadable') return this.handshakes.unreadable(envelope, deviceId)

    const wasAwake = this.isAwake(deviceId)

    this.lastHeard.set(deviceId, Date.now())

    if (opened.first) this.handlers.newKeys(deviceId)
    else if (!wasAwake) this.handlers.woke(deviceId)

    if (opened.first || !wasAwake) this.core.onView()

    if (!this.limits.allowBytes(deviceId, opened.bytes.length)) {
      return console.warn('[remote] телефон шлёт больше своей доли - кадр отброшен')
    }

    this.deliver(deviceId, parsePhoneMessage(decodeBody(opened.bytes)))
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

  /** Слово спаренного телефона: кусок - в сборку, остальное - через предел частоты наверх. */
  private deliver(deviceId: string, message: PhoneMessage | null) {
    if (!message) return
    if (message.k === 'part') return this.assemble(deviceId, message)
    if (this.admit(deviceId, message)) this.handlers.handle(deviceId, message)
  }

  /**
   * Предел частоты - при получении, как у каждого слова: работа, принятая до отзыва или
   * выключения, уже посчитана. Команда считается по имени (отказы - одной кучей); повтор
   * команды, которую мост уже принял, не считается - это доставка, а не новая просьба.
   */
  private admit(deviceId: string, message: Exclude<PhoneMessage, PartMessage>): boolean {
    if (message.k !== 'cmd') return this.limits.allow(deviceId, message.k)
    if (this.handlers.knownCommand(deviceId, message.id)) return true
    if (this.limits.allow(deviceId, limitKindOf(message))) return true

    this.rateLimited(deviceId, message)

    return false
  }

  private rateLimited(deviceId: string, message: CmdMessage) {
    this.reply(
      deviceId,
      { p: PROTOCOL_VERSION, k: 'result', id: message.id, ok: false, code: 'rateLimited' },
      'urgent',
    )
  }

  private assemble(deviceId: string, part: PartMessage) {
    if (!this.limits.allow(deviceId, part.k)) return

    const outcome = this.parts.take(deviceId, part)

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

    if (!assembled || assembled.k === 'part')
      return console.warn('[remote] частями пришло не сообщение')
    if (this.admit(deviceId, assembled)) this.handlers.handle(deviceId, assembled)
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

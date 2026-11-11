import { parseHandshakeReply } from '@agentic-workstation/remote-protocol/agent-messages'
import type { PairAck } from '@agentic-workstation/remote-protocol/agent-messages'
import { fromBase64Url } from '@agentic-workstation/remote-protocol/base64'
import { decodeBody, encodeBody } from '@agentic-workstation/remote-protocol/body'
import { encodeFrame, FRAME_SEALED } from '@agentic-workstation/remote-protocol/frame'

import type { KeyStore, MachineRecord, DeviceIdentity } from './keystore'
import type { LinkStatus, MachineSession } from './machine-session'
import type { PairOutcome, PairingOffer } from './pairing'
import { pairInitOf, acceptPairAck, PAIRING_PATIENCE_MS } from './pairing'
import type { RelaySocket, SocketState } from './relay-socket'

export type HandshakesHost = {
  sessions: ReadonlyMap<string, MachineSession>
  store: KeyStore
  socketFor: (relayUrl: string) => RelaySocket
  /** Свой адрес на релее; создаётся с первой парой. */
  deviceOf: (label: string) => Promise<DeviceIdentity>
  /** Ключи с IDE готовы. */
  opened: (session: MachineSession) => void
  setStatus: (session: MachineSession, status: LinkStatus) => void
  machinesChanged: () => void
  add: (record: MachineRecord) => MachineSession
  now: () => number
}

/** Сколько ждать линию до релея, прежде чем сказать «нет связи» на экране пары. */
export const LINE_PATIENCE_MS = 10_000

type Pairing = {
  offer: PairingOffer
  deviceId: string
  resolve: (outcome: PairOutcome) => void
  timer: ReturnType<typeof setTimeout>
}

const waitUntil = async (probe: () => boolean, timeoutMs: number): Promise<boolean> => {
  for (let waited = 0; waited < timeoutMs; waited += 100) {
    if (probe()) return true

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  return probe()
}

/**
 * Рукопожатия телефона: пара по QR и ключи каждой новой линии (sessionInit), открытые ответы
 * IDE - pairAck, sessionAck, «твои ключи не наши», «тебя отпустили». Открытым телом IDE говорит
 * только это: ключей ещё нет, эти кадры их и дают.
 */
export class Handshakes {
  private pairing: Pairing | null = null

  constructor(private readonly host: HandshakesHost) {}

  /** Свежий ключ этой IDE (fresh) или повтор того же, что ждёт ответа. */
  async begin(session: MachineSession, fresh: boolean): Promise<void> {
    if (session.record.revoked) return

    const socket = this.host.socketFor(session.record.relayUrl)

    if (!socket.isOpen) return

    socket.send(await session.sessionInit(fresh, this.host.now()))
  }

  /** Линия до релея открылась: ключи прежней линии не в счёт, каждой IDE - свежий ключ. */
  lineOpened(relayUrl: string): void {
    for (const session of this.onRelay(relayUrl)) {
      session.close()
      this.host.setStatus(session, 'connecting')
      void this.begin(session, true)
    }
  }

  /** Линия оборвалась: ключи этой линии больше ничего не значат. */
  lineLost(relayUrl: string, state: SocketState): void {
    for (const session of this.onRelay(relayUrl)) {
      session.close()
      this.host.setStatus(session, state === 'refused' ? 'offline' : 'connecting')
    }
  }

  /** Открытое слово IDE (счётчик 0). */
  async reply(agentId: string, body: Uint8Array): Promise<void> {
    const reply = parseHandshakeReply(decodeBody(body))
    const session = this.host.sessions.get(agentId)

    if (!reply) return

    switch (reply.k) {
      case 'pairAck':
        return this.finishPairing(agentId, reply)
      case 'sessionAck':
        if (session && !session.record.revoked && (await session.sessionAck(reply))) {
          this.host.opened(session)
        }

        return
      case 'sessionStale':
        if (!session || session.record.revoked) return

        session.close()

        return this.begin(session, true)
      case 'revoked':
        if (session) await this.revoked(session)
    }
  }

  /** IDE отпустила телефон: ключи пары больше ничего не открывают, нужна новая пара. */
  async revoked(session: MachineSession): Promise<void> {
    if (session.record.revoked) return

    session.record = { ...session.record, revoked: true }
    session.close()
    this.host.setStatus(session, 'revoked')
    await this.host.store.saveMachine(session.record)
    this.host.machinesChanged()
  }

  /** Пара: доказательство, что видели QR, и ожидание Approve человека в IDE. */
  async pair(offer: PairingOffer, label: string): Promise<PairOutcome> {
    this.cancelPairing()

    const device = await this.host.deviceOf(label)
    const socket = this.host.socketFor(offer.relayUrl)

    socket.start()
    socket.wake()

    if (!(await waitUntil(() => socket.isOpen, LINE_PATIENCE_MS))) {
      return { ok: false, reason: 'offline' }
    }

    const init = await pairInitOf(offer, device.deviceId, label)
    const agent = fromBase64Url(offer.code.agentId) ?? new Uint8Array(16)
    const self = fromBase64Url(device.deviceId) ?? new Uint8Array(16)

    if (!socket.send(encodeFrame(FRAME_SEALED, agent, self, 0n, encodeBody(init)))) {
      return { ok: false, reason: 'offline' }
    }

    return new Promise((resolve) => {
      this.pairing = {
        offer,
        deviceId: device.deviceId,
        resolve,
        timer: setTimeout(() => this.settle({ ok: false, reason: 'timeout' }), PAIRING_PATIENCE_MS),
      }
    })
  }

  cancelPairing(): void {
    this.settle({ ok: false, reason: 'cancelled' })
  }

  /** Ответ на пару - только от той IDE, чей код открыт, и только пока пара ждёт. */
  private async finishPairing(agentId: string, ack: PairAck) {
    const pairing = this.pairing

    if (!pairing || pairing.offer.code.agentId !== agentId) return

    const outcome = await acceptPairAck(pairing.offer, ack, pairing.deviceId, this.host.now())

    if (this.pairing !== pairing) return

    if (outcome.ok) {
      await this.host.store.saveMachine(outcome.record)

      const session = this.host.add(outcome.record)

      session.open(outcome.keys)
      this.host.opened(session)
      this.host.machinesChanged()
    }

    this.settle(outcome)
  }

  private settle(outcome: PairOutcome) {
    const pairing = this.pairing

    if (!pairing) return

    clearTimeout(pairing.timer)
    this.pairing = null
    pairing.resolve(outcome)
  }

  private onRelay(relayUrl: string): MachineSession[] {
    return [...this.host.sessions.values()].filter(
      (session) => session.record.relayUrl === relayUrl && !session.record.revoked,
    )
  }
}

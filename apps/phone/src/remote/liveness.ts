import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'

import type { LinkStatus, MachineSession } from './machine-session'
import type { RelaySocket } from './relay-socket'

/** Такт часов: проверка линий и IDE. */
export const TICK_MS = 5_000

/** Сердцебиение до релея (кадр себе). */
export const BEAT_MS = 20_000

/**
 * Стук IDE, пока экран открыт: IDE считает телефон на связи, пока слышит его чаще 45 с, и
 * отвечает лёгким pong. Им же телефон проверяет, что IDE жива, - без переспроса всего списка.
 */
export const PING_MS = 25_000

/** Сколько ждать pong (или любого слова IDE) на стук, прежде чем сказать «IDE не отвечает». */
export const PONG_PATIENCE_MS = 15_000

/** Сколько ждать ответа на свежий ключ, прежде чем сказать «IDE не отвечает». */
export const HANDSHAKE_PATIENCE_MS = 8_000

/** Повтор того же ключа: IDE могла включить Remote Control или проснуться. */
export const HANDSHAKE_RETRY_MS = 20_000

/** Линии до релея нет так долго - IDE за ней тоже не видна. */
export const LINE_LOST_MS = 10_000

export type LivenessHost = {
  sessions: () => MachineSession[]
  sockets: () => RelaySocket[]
  socketOpen: (session: MachineSession) => boolean
  send: (agentId: string, message: object) => Promise<boolean>
  handshake: (session: MachineSession, fresh: boolean) => Promise<void>
  setStatus: (session: MachineSession, status: LinkStatus) => void
  now: () => number
}

/**
 * Часы линий: сердцебиение до релея, стук каждой IDE и проверка, что она отвечает. Без них
 * телефон держал бы «на связи» IDE, которую давно закрыли: релей молча сложил бы кадры в ящик.
 */
export class Liveness {
  private timer: ReturnType<typeof setInterval> | null = null
  private lastBeat = 0

  constructor(private readonly host: LivenessHost) {}

  start(): void {
    if (this.timer) return

    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)

    this.timer = null
  }

  tick(): void {
    const now = this.host.now()

    if (now - this.lastBeat >= BEAT_MS) {
      this.lastBeat = now

      for (const socket of this.host.sockets()) socket.beat()
    }

    for (const session of this.host.sessions()) {
      if (session.record.revoked) continue

      if (!this.host.socketOpen(session)) {
        if (session.status === 'connecting' && now - session.statusAt >= LINE_LOST_MS) {
          this.host.setStatus(session, 'offline')
        }

        continue
      }

      if (session.isOpen) this.checkOpen(session, now)
      else this.checkHandshake(session, now)
    }
  }

  /**
   * Стук и проверка ответа. Ответ - любое открывшееся слово IDE после стука (pong или лента,
   * что пришла раньше него; ждать снимает клиент): молчание дольше PONG_PATIENCE_MS - IDE не
   * отвечает, ключи этой линии - вон и новое рукопожатие.
   */
  private checkOpen(session: MachineSession, now: number) {
    if (session.awaitingPong > 0 && now - session.awaitingPong >= PONG_PATIENCE_MS) {
      session.awaitingPong = 0
      session.close()
      this.host.setStatus(session, 'offline')
      void this.host.handshake(session, true)

      return
    }

    if (now - session.lastPing < PING_MS) return

    session.lastPing = now
    session.pingN += 1

    if (session.awaitingPong === 0) session.awaitingPong = now

    void this.host.send(session.agentId, { p: PROTOCOL_VERSION, k: 'ping', n: session.pingN })
  }

  private checkHandshake(session: MachineSession, now: number) {
    const sentAt = session.handshakeSentAt

    if (sentAt === 0) return void this.host.handshake(session, true)
    if (now - sentAt >= HANDSHAKE_RETRY_MS) return void this.host.handshake(session, false)
    if (now - sentAt >= HANDSHAKE_PATIENCE_MS) this.host.setStatus(session, 'offline')
  }
}

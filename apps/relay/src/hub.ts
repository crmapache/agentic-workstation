import type { WebSocket } from 'ws'

import type { Envelope } from './frame.ts'
import { addressHint, encodeAddress } from './frame.ts'
import type { Mailboxes } from './mailbox.ts'

/**
 * Кто на линии и куда идёт кадр. Всё знание релея - здесь: карта от непрозрачного адреса к
 * открытому сокету. Ни аккаунтов, ни пар, ни того, чья IDE чья: IDE и телефон договариваются
 * между собой и релею ничего об этом не говорят. Кадр пары он не отличит от кадра ленты.
 */

export type Kind = 'agent' | 'device'

/** Адрес занял другой сокет - вытесненный закрывается этим кодом и знает, почему. */
export const CLOSE_DISPLACED = 4009

/** Адрес в URL - не адрес. Повтор ничего не изменит. */
export const CLOSE_BAD_ADDRESS = 4001

/** Кадр не на языке релея (текстовый, чужая версия). */
export const CLOSE_BAD_VERSION = 4002

/** Кадров больше потолка в минуту - стандартное «нарушение правил». */
export const CLOSE_POLICY = 1008

type Connection = { socket: WebSocket; kind: Kind }

export class Hub {
  private readonly connections = new Map<string, Connection>()
  private readonly mailboxes: Mailboxes
  private readonly log: (line: string) => void

  constructor(mailboxes: Mailboxes, log: (line: string) => void) {
    this.mailboxes = mailboxes
    this.log = log
  }

  /**
   * Взять адрес. Одно соединение на адрес: вторая IDE с тем же адресом иначе делила бы с
   * первой каждый кадр пополам. Прежнее закрывается своим кодом, а не молча.
   */
  open(address: Buffer, kind: Kind, socket: WebSocket, now: number): void {
    const key = encodeAddress(address)
    const existing = this.connections.get(key)

    if (existing) {
      this.log(`displacing an earlier connection for ${addressHint(address)}`)
      existing.socket.close(CLOSE_DISPLACED, 'another connection took this address')
    }

    this.connections.set(key, { socket, kind })

    // Что пришло, пока его не было, - в том порядке, в каком пришло.
    for (const frame of this.mailboxes.take(key, now)) socket.send(frame)
  }

  /** Только если сокет всё ещё наш: вытесненный, закрывшись позже, не уносит нового. */
  close(address: Buffer, socket: WebSocket): void {
    const key = encodeAddress(address)

    if (this.connections.get(key)?.socket === socket) this.connections.delete(key)
  }

  /**
   * Передать кадр дальше байт в байт. Адресат - сам отправитель (сердцебиение IDE: у сокета
   * Node нет пинга) - кадр возвращается ему же.
   */
  route(envelope: Envelope, raw: Buffer, now: number): void {
    const key = encodeAddress(envelope.to)
    const target = this.connections.get(key)

    if (target) {
      target.socket.send(raw)

      return
    }

    this.mailboxes.hold(key, envelope.from, raw, now)
  }

  present(address: Buffer): boolean {
    return this.connections.has(encodeAddress(address))
  }

  count(): number {
    return this.connections.size
  }
}

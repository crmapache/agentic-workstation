import type { WebSocket } from 'ws'

import type { Envelope } from './frame.ts'
import { addressHint, controlFrame, encodeAddress } from './frame.ts'
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

/** readyState открытого сокета (WebSocket.OPEN) - без импорта значения ради одной цифры. */
const OPEN = 1

/**
 * Сколько недавних отправителей помнить на соединение и как долго. Сокет, который умер молча
 * (крышка ноутбука, тоннель), принимает кадры, пока релей не заметит смерть, - до двух пингов.
 * Тех, кто писал ему за это время, и надо попросить переспросить.
 */
const MAX_PEERS = 16

export const PEER_MEMORY_MS = 60_000

type Connection = {
  socket: WebSocket
  kind: Kind
  /** Кто недавно писал этому адресу: адрес отправителя и когда. */
  peers: Map<string, { from: Buffer; at: number }>
}

export class Hub {
  private readonly connections = new Map<string, Connection>()
  private readonly mailboxes: Mailboxes
  private readonly log: (line: string) => void

  constructor(mailboxes: Mailboxes, log: (line: string) => void) {
    this.mailboxes = mailboxes
    this.log = log
  }

  /**
   * Взять адрес - уже доказанный подписью (claim.ts). Одно соединение на адрес: вторая IDE с
   * тем же адресом иначе делила бы с первой каждый кадр пополам. Прежнее закрывается своим
   * кодом, а не молча. Новому - сначала «переспроси» от каждого, кто недавно писал прежнему: те
   * кадры могли уйти в сокет, которого уже нет на том конце (ноутбук проснулся и звонит заново,
   * а старый сокет ещё не замечен мёртвым).
   *
   * false - адрес держит соединение другого вида: телефон не вытесняет IDE с её адреса, и
   * наоборот, даже с верной подписью.
   */
  open(address: Buffer, kind: Kind, socket: WebSocket, now: number): boolean {
    const key = encodeAddress(address)
    const existing = this.connections.get(key)

    if (existing && existing.kind !== kind) return false

    if (existing) {
      this.log(`displacing an earlier connection for ${addressHint(address)}`)
      existing.socket.close(CLOSE_DISPLACED, 'another connection took this address')
    }

    this.connections.set(key, { socket, kind, peers: new Map() })

    for (const from of recentPeers(existing, now)) socket.send(controlFrame(address, from))

    // Что пришло, пока его не было, - в том порядке, в каком пришло.
    for (const frame of this.mailboxes.take(key, now)) socket.send(frame)

    return true
  }

  /** Только если сокет всё ещё наш: вытесненный, закрывшись позже, не уносит нового. */
  close(address: Buffer, socket: WebSocket): void {
    const key = encodeAddress(address)

    if (this.connections.get(key)?.socket === socket) this.connections.delete(key)
  }

  /**
   * Сокет не ответил на пинг и закрывается: всё, что ему отправили с последнего ответа, могло
   * не дойти. Адресат, вернувшись, первым услышит «переспроси» от каждого недавнего отправителя.
   */
  lost(address: Buffer, socket: WebSocket, now: number): void {
    const key = encodeAddress(address)
    const connection = this.connections.get(key)

    if (connection?.socket !== socket) return

    for (const from of recentPeers(connection, now)) this.mailboxes.markLost(key, from, now)

    this.connections.delete(key)
  }

  /**
   * Передать кадр дальше байт в байт. Адресат - сам отправитель (сердцебиение IDE: у сокета
   * Node нет пинга) - кадр возвращается ему же. Только открытому сокету: закрывающийся (его
   * только что вытеснили или он уходит) кадр молча выбросил бы, а ящик его подержит.
   */
  route(envelope: Envelope, raw: Buffer, now: number): void {
    const key = encodeAddress(envelope.to)
    const target = this.connections.get(key)

    if (target?.socket.readyState === OPEN) {
      remember(target, envelope, now)
      target.socket.send(raw)

      return
    }

    this.mailboxes.hold(key, envelope.from, raw, now)
  }

  /** Слово самого релея стороне - только на открытый сокет: в ящик его класть незачем. */
  tell(address: Buffer, frame: Buffer): void {
    const target = this.connections.get(encodeAddress(address))

    if (target?.socket.readyState === OPEN) target.socket.send(frame)
  }

  present(address: Buffer): boolean {
    return this.connections.has(encodeAddress(address))
  }

  count(): number {
    return this.connections.size
  }
}

/** Отправитель - в память соединения; свежий встаёт последним, самый старый уходит. */
const remember = (connection: Connection, envelope: Envelope, now: number) => {
  if (envelope.from.equals(envelope.to)) return

  const key = encodeAddress(envelope.from)

  connection.peers.delete(key)
  connection.peers.set(key, { from: Buffer.from(envelope.from), at: now })

  if (connection.peers.size > MAX_PEERS) {
    const oldest = connection.peers.keys().next().value

    if (oldest !== undefined) connection.peers.delete(oldest)
  }
}

const recentPeers = (connection: Connection | undefined, now: number): Buffer[] =>
  [...(connection?.peers.values() ?? [])]
    .filter((peer) => now - peer.at <= PEER_MEMORY_MS)
    .map((peer) => peer.from)

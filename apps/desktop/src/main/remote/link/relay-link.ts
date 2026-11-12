import type { RemoteLinkState } from '@shared/remote'

import { FRAME_CHALLENGE, MAX_FRAME_BYTES } from '@agentic-workstation/remote-protocol/frame'

import type { Envelope } from '../wire/frame'
import { parseFrame, encodeAddress, heartbeatFrame } from '../wire/frame'
import type { Failure } from './backoff'
import { Backoff, classifyClose } from './backoff'
import type { Seal, RemoteOutbox } from './outbox'

/** Что нужно от сокета: ровно то, что умеет WebSocket из Node (и подделка в тесте). */
export type SocketLike = {
  binaryType: string
  readonly readyState: number
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number }) => void) | null
  onerror: ((event: { message?: string }) => void) | null
  send: (data: Uint8Array) => void
  close: (code?: number, reason?: string) => void
}

const OPEN = 1

/** Тишина дольше этого - линия мертва, хотя сокет и говорит OPEN (ноутбук проснулся). */
export const SILENCE_MS = 45_000

/** Сколько линия должна простоять, чтобы вытеснение считалось новым событием. */
export const STEADY_MS = 60_000

/**
 * Сокет открылся, а вызова релея «докажи адрес» нет так долго - это не наш релей (или старый,
 * без доказательства): кадры через него не пойдут.
 */
export const CHALLENGE_WAIT_MS = 15_000

export type RelayLinkOptions = {
  address: Buffer
  relayUrl: string
  /** Ответ на вызов релея: кадр с ключом подписи и подписью (relay-claim.ts). */
  prove: (challenge: Uint8Array) => Buffer
  outbox: RemoteOutbox
  onFrame: (envelope: Envelope) => void
  onState: (state: RemoteLinkState) => void
  createSocket: (url: string) => SocketLike
  now?: () => number
}

/**
 * Одна линия до релея на всю IDE. Звоним сами: снаружи до машины за домашним роутером не
 * достучаться. Линия считается поднятой, когда IDE ответила на вызов релея подписью: до этого
 * релей её кадры никуда не пустит. Пинга у WebSocket из Node нет, поэтому сердцебиение -
 * пустой кадр самому себе: релей вернёт его этой же линией, и это доказывает, что линия жива,
 * а не только что сокет пишет OPEN.
 */
export class RelayLink {
  private readonly backoff = new Backoff()
  private socket: SocketLike | null = null
  /** Адрес доказан на этом сокете: только теперь кадры пойдут дальше релея. */
  private proven = false
  private openedAt = 0
  private running = false
  private retryTimer: NodeJS.Timeout | null = null
  private lastHeard = 0
  private connectedAt = 0
  private current: RemoteLinkState = 'off'

  constructor(private readonly options: RelayLinkOptions) {}

  get state(): RemoteLinkState {
    return this.current
  }

  start(): void {
    if (this.running) return

    this.running = true
    this.connect()
  }

  stop(): void {
    this.running = false

    if (this.retryTimer) clearTimeout(this.retryTimer)

    this.retryTimer = null
    this.drop(this.socket)
    this.move('off')
  }

  /**
   * Отправить ждущее, запечатывая в порядке ухода. Не ушедшее возвращается в очередь, а не
   * пропадает. Только открытому сокету: закрывающийся проглотил бы кадры молча.
   */
  flush(seal: Seal, resyncFrame: (deviceId: string) => Buffer | null): void {
    const socket = this.socket

    if (!socket || socket.readyState !== OPEN || !this.proven) return

    const waiting = this.options.outbox.drain(seal, resyncFrame)

    for (const [index, item] of waiting.entries()) {
      // Переросший кадр релей не пропустит, а закроет сокет: выбросить один кадр дешевле.
      if (item.frame.length > MAX_FRAME_BYTES) {
        console.warn(`[remote] кадр в ${item.frame.length} байт больше потолка релея - выброшен`)
        continue
      }

      try {
        socket.send(item.frame)
      } catch (error) {
        console.warn('[remote] релей не взял кадр:', error)
        this.options.outbox.putBack(waiting.slice(index))

        return
      }
    }
  }

  /**
   * Сердцебиение: пустой кадр себе и проверка тишины. Без него проснувшийся ноутбук держал
   * бы мёртвый сокет, пока кто-нибудь не заметит.
   */
  checkAlive(): void {
    const socket = this.socket
    const now = this.now()

    if (!socket || socket.readyState !== OPEN) return

    if (!this.proven) {
      if (now - this.openedAt < CHALLENGE_WAIT_MS) return

      console.warn('[remote] релей не спросил доказательство адреса - переподключаюсь')
      this.drop(socket)

      return this.retry('network')
    }

    if (this.connectedAt > 0 && now - this.connectedAt > STEADY_MS) this.backoff.heldOn()

    try {
      socket.send(heartbeatFrame(this.options.address))
    } catch {
      // Отправка не прошла - тишина ниже это и покажет.
    }

    if (this.lastHeard === 0 || now - this.lastHeard < SILENCE_MS) return

    console.warn('[remote] релей молчит слишком долго - переподключаюсь')
    this.drop(socket)
    this.retry('network')
  }

  private connect() {
    if (!this.running) return

    // Первый звонок - «connecting»; повтор оставляет причину на экране (сеть, релей, вытеснение).
    this.move(this.current === 'off' ? 'connecting' : this.current)

    const base = this.options.relayUrl.replace(/\/+$/, '')
    const url = `${base}/v1/agent?id=${encodeAddress(this.options.address)}`
    let socket: SocketLike

    try {
      socket = this.options.createSocket(url)
    } catch (error) {
      console.warn('[remote] сокет до релея не создался:', error)

      return this.retry('network')
    }

    socket.binaryType = 'arraybuffer'
    this.socket = socket
    this.proven = false
    socket.onopen = () => {
      if (this.socket !== socket) return

      this.openedAt = this.now()
      this.lastHeard = this.openedAt
    }
    socket.onmessage = (event) => {
      if (this.socket === socket) this.receive(event.data)
    }
    socket.onclose = (event) => {
      if (this.socket !== socket) return

      this.socket = null
      this.proven = false
      this.retry(classifyClose(event.code))
    }
    socket.onerror = (event) => {
      if (this.socket !== socket || socket.readyState === OPEN) return

      // Ошибка до открытия: ответ 5xx/429 на апгрейде - релей нездоров, иначе сеть.
      const relayUnwell = /\b(5\d\d|429)\b/.test(event.message ?? '')

      this.socket = null
      this.drop(socket)
      this.retry(relayUnwell ? 'relay' : 'network')
    }
  }

  private receive(data: unknown) {
    this.lastHeard = this.now()

    const bytes =
      data instanceof ArrayBuffer ? new Uint8Array(data) : Buffer.isBuffer(data) ? data : null

    if (!bytes) return

    try {
      const envelope = parseFrame(bytes, MAX_FRAME_BYTES)

      if (envelope.type === FRAME_CHALLENGE) return this.answer(envelope.body)
      if (!this.proven) return

      // Своё сердцебиение вернулось - это и был ответ.
      if (envelope.from.equals(this.options.address)) return

      this.options.onFrame(envelope)
    } catch (error) {
      // Причина, никогда не байты: чужой кадр не наш, чтобы его записывать.
      console.warn('[remote] кадр релея не разобрался:', (error as Error).message)
    }
  }

  /**
   * Вызов релея: подписать и ответить. Релей разбирает кадры по порядку, поэтому всё, что
   * уйдёт после ответа, он увидит уже от доказанного адреса - ждать его «да» незачем.
   */
  private answer(challenge: Uint8Array) {
    const socket = this.socket

    if (!socket || this.proven) return

    try {
      socket.send(this.options.prove(challenge))
    } catch (error) {
      console.warn('[remote] ответ на вызов релея не ушёл:', error)

      return
    }

    this.proven = true
    this.lastHeard = this.now()
    this.connectedAt = this.lastHeard
    this.backoff.succeeded()
    this.move('connected')
  }

  private retry(failure: Failure) {
    if (!this.running) return

    const pause = this.backoff.next(failure)

    if (pause === null) {
      this.running = false

      return this.move('refused')
    }

    this.move(
      failure === 'relay' ? 'relayDown' : failure === 'displaced' ? 'displaced' : 'reconnecting',
    )

    if (this.retryTimer) clearTimeout(this.retryTimer)

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.connect()
    }, pause)
    this.retryTimer.unref()
  }

  /** Отпустить сокет молча: его поздние события не должны трогать линию, что пришла на смену. */
  private drop(socket: SocketLike | null) {
    if (!socket) return

    if (this.socket === socket) {
      this.socket = null
      this.proven = false
    }

    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null

    try {
      socket.close(1000, 'stopping')
    } catch {
      // Уже закрыт.
    }
  }

  private move(next: RemoteLinkState) {
    if (this.current === next) return

    this.current = next
    this.options.onState(next)
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }
}

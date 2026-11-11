import type { Frame } from '@agentic-workstation/remote-protocol/frame'
import {
  sameBytes,
  decodeFrame,
  encodeFrame,
  FRAME_SEALED,
  FRAME_CHALLENGE,
  MAX_FRAME_BYTES,
} from '@agentic-workstation/remote-protocol/frame'

import type { Failure } from './backoff'
import { Backoff, classifyClose } from './backoff'

/** Что нужно от сокета: ровно то, что умеет WebSocket браузера (и Node в тестах). */
export type SocketLike = {
  binaryType: string
  readonly readyState: number
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number }) => void) | null
  onerror: ((event: unknown) => void) | null
  send: (data: Uint8Array) => void
  close: (code?: number, reason?: string) => void
}

/**
 * idle - ещё не звали; connecting - звоним; open - на линии; waiting - пауза перед повтором;
 * refused - больше не звоним сами (адрес занят другой вкладкой, релей не принял адрес).
 */
export type SocketState = 'idle' | 'connecting' | 'open' | 'waiting' | 'refused'

const OPEN = 1

/** Тишина дольше этого - линия мертва, хотя сокет и говорит OPEN (телефон проснулся). */
export const SILENCE_MS = 45_000

/** Сокет открыт, а вызова релея «докажи адрес» так и нет - это не наш релей. */
export const CHALLENGE_WAIT_MS = 15_000

export type RelaySocketOptions = {
  /** wss://хост релея (ws:// - только локально). */
  relayUrl: string
  deviceId: string
  address: Uint8Array
  /** Ответ на вызов релея: кадр с ключом подписи телефона и подписью (proofs.ts). */
  prove: (challenge: Uint8Array) => Promise<Uint8Array>
  onFrame: (frame: Frame) => void
  onOpen: () => void
  onState: (state: SocketState) => void
  createSocket: (url: string) => SocketLike
  now?: () => number
}

/**
 * Одна линия телефона до релея на все IDE этого релея. Линия открыта, когда телефон ответил на
 * вызов релея подписью своего ключа: до этого релей его кадры никуда не пустит. Пинга у
 * WebSocket браузера нет, поэтому сердцебиение - пустой кадр самому себе: релей вернёт его этой
 * же линией, и это доказывает, что линия жива, а не только что сокет пишет OPEN. Обрыв - повтор
 * с отступом.
 */
export class RelaySocket {
  private readonly backoff = new Backoff()
  private socket: SocketLike | null = null
  /** Адрес доказан на этом сокете. */
  private proven = false
  private openedAt = 0
  private running = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private lastHeard = 0
  private current: SocketState = 'idle'

  constructor(private readonly options: RelaySocketOptions) {}

  get state(): SocketState {
    return this.current
  }

  get isOpen(): boolean {
    return this.proven && this.socket?.readyState === OPEN
  }

  start(): void {
    if (this.running) return

    this.running = true
    this.connect()
  }

  stop(): void {
    this.running = false
    this.clearRetry()
    this.drop(this.socket)
    this.move('idle')
  }

  /**
   * Человек вернулся к странице, сеть появилась или он нажал «переподключить»: отступ с нуля и
   * звонок сразу, если линии нет. Живую линию не трогает.
   */
  wake(): void {
    this.backoff.reset()

    if (this.socket?.readyState === OPEN || this.current === 'connecting') return

    this.running = true
    this.clearRetry()
    this.connect()
  }

  /** Отправить кадр; линии нет - false: что слать заново, решает тот, кто слал. */
  send(frame: Uint8Array): boolean {
    const socket = this.socket

    // До ответа на вызов любой другой кадр релей принял бы за неверное доказательство (4003).
    if (!socket || !this.isOpen || frame.length > MAX_FRAME_BYTES) return false

    try {
      socket.send(frame)

      return true
    } catch {
      return false
    }
  }

  /** Сердцебиение и проверка тишины - раз в такт часов клиента. */
  beat(): void {
    if (this.socket?.readyState === OPEN && !this.proven) {
      if (this.now() - this.openedAt < CHALLENGE_WAIT_MS) return

      this.drop(this.socket)

      return this.retry('network')
    }

    if (!this.isOpen) return

    const { address } = this.options

    this.send(encodeFrame(FRAME_SEALED, address, address, 0n, new Uint8Array(0)))

    if (this.now() - this.lastHeard < SILENCE_MS) return

    this.drop(this.socket)
    this.retry('network')
  }

  private connect() {
    if (!this.running) return

    this.move('connecting')

    const url = `${this.options.relayUrl.replace(/\/+$/, '')}/v1/device?id=${this.options.deviceId}`
    let socket: SocketLike

    try {
      socket = this.options.createSocket(url)
    } catch {
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
      if (this.socket === socket) this.receive(socket, event.data)
    }
    socket.onclose = (event) => {
      if (this.socket !== socket) return

      this.socket = null
      this.proven = false
      this.retry(classifyClose(event.code))
    }
    socket.onerror = () => {
      if (this.socket !== socket || socket.readyState === OPEN) return

      this.drop(socket)
      this.retry('network')
    }
  }

  private receive(socket: SocketLike, data: unknown) {
    this.lastHeard = this.now()

    if (!(data instanceof ArrayBuffer)) return

    try {
      const frame = decodeFrame(new Uint8Array(data))

      if (frame.type === FRAME_CHALLENGE) return void this.answer(socket, frame.body)
      if (!this.proven) return

      // Своё сердцебиение вернулось - это и был ответ.
      if (sameBytes(frame.from, this.options.address)) return

      this.options.onFrame(frame)
    } catch {
      // Кадр не на языке протокола - не наш, разбирать его дальше нечего.
    }
  }

  /**
   * Вызов релея: подписать ключом телефона и ответить. Релей разбирает кадры по порядку, и всё,
   * что уйдёт после ответа, он увидит уже от доказанного адреса - его «да» ждать незачем.
   */
  private async answer(socket: SocketLike, challenge: Uint8Array) {
    if (this.proven) return

    let proof: Uint8Array

    try {
      proof = await this.options.prove(challenge)
    } catch {
      // Ключа подписи нет или WebCrypto отказал: повтор не поможет - ждать человека.
      this.drop(socket)

      return this.retry('fatal')
    }

    if (this.socket !== socket || socket.readyState !== OPEN) return

    try {
      socket.send(proof)
    } catch {
      return
    }

    this.proven = true
    this.backoff.succeeded()
    this.move('open')
    this.options.onOpen()
  }

  private retry(failure: Failure) {
    if (!this.running) return

    const pause = this.backoff.next(failure)

    if (pause === null) {
      this.running = false

      return this.move('refused')
    }

    this.move('waiting')
    this.clearRetry()
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.connect()
    }, pause)
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer)

    this.retryTimer = null
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
      socket.close(1000, 'closing')
    } catch {
      // Уже закрыт.
    }
  }

  private move(next: SocketState) {
    if (this.current === next) return

    this.current = next
    this.options.onState(next)
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }
}

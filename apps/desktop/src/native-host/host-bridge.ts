import type { Socket } from 'node:net'

import {
  AUTH_OK,
  proofOf,
  AUTH_HUB,
  newNonce,
  AUTH_HOST,
  sameProof,
} from '@agentic-workstation/browser-protocol/bridge-auth'
import {
  encodeFrame,
  FrameDecoder,
  encodeFrameJson,
} from '@agentic-workstation/browser-protocol/framing'
import { parseLine, encodeLine, LineSplitter } from '@agentic-workstation/browser-protocol/lines'
import { HOST_TO_CHROME_MAX_BYTES } from '@agentic-workstation/browser-protocol/protocol'
import type { HostStatus, HostStatusMessage } from '@agentic-workstation/browser-protocol/protocol'

/** Как часто стучаться в сокет IDE, пока её нет: старт IDE занимает секунды, а попытка - доли миллисекунды. */
export const RECONNECT_MS = 1500

/** С чем мост работает: stdout к Chrome, сокет IDE, журнал (stderr), выход процесса. */
export type BridgeIo = {
  toChrome: (frame: Uint8Array) => void
  connect: () => Socket
  log: (text: string) => void
  exit: (code: number) => void
  /**
   * Ключ моста (ADR 0048, Windows): есть - до первого кадра IDE и host доказывают друг другу,
   * что знают его (bridge-auth.ts). Нет - сокет закрыт правами файла (мак), проверки нет.
   */
  key?: string | undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Мост native messaging ↔ unix-сокет IDE (ADR 0040). Chrome держит host, пока открыт порт
 * расширения; IDE может быть не запущена или перезапуститься - тогда мост говорит расширению
 * «IDE нет» и переподключается сам. Пока IDE нет, сообщения расширения отбрасываются: оно
 * шлёт hello заново, услышав «connected».
 *
 * Ответ расширения уходит в IDE, только если запрос с этим id пришёл по нынешнему сокету.
 * Иначе поздний ответ на запрос прежней IDE (до её перезапуска) закрыл бы новый запрос с тем
 * же id - например, ложным «отладчик подключён».
 */
export class HostBridge {
  private socket: Socket | null = null
  private connected = false
  /** id запросов, пересланных в Chrome по нынешнему сокету и ещё без ответа. */
  private forwarded = new Set<number>()
  private status: HostStatus | null = null
  private retry: ReturnType<typeof setTimeout> | null = null
  private closed = false
  private readonly frames = new FrameDecoder()

  constructor(private readonly io: BridgeIo) {}

  start(): void {
    this.dial()
  }

  /** Байты от Chrome (stdin). Битый кадр - поток не спасти, host выходит. */
  fromChrome(chunk: Uint8Array): void {
    let messages: unknown[]

    try {
      messages = this.frames.push(chunk)
    } catch (error) {
      this.io.log(`bad frame from Chrome: ${String(error)}`)
      this.close(1)

      return
    }

    for (const message of messages) {
      if (!this.connected) continue

      if (isRecord(message) && message['type'] === 'response') {
        const id = message['id']

        // Ответ на запрос, которого этот сокет не присылал: прежней IDE он уже не нужен.
        if (typeof id !== 'number' || !this.forwarded.delete(id)) continue
      }

      this.socket?.write(encodeLine(message))
    }
  }

  private markConnected(): void {
    this.connected = true
    this.report('connected')
  }

  /** Chrome закрыл порт (stdin кончился): host больше не нужен. */
  close(code = 0): void {
    if (this.closed) return

    this.closed = true

    if (this.retry) clearTimeout(this.retry)

    this.socket?.destroy()
    this.io.exit(code)
  }

  private dial(): void {
    if (this.closed) return

    const socket = this.io.connect()
    const lines = new LineSplitter()
    const { key } = this.io
    // Ждём ли проверку IDE: пока она не пройдена, строки - проверка, а не сообщения. Шаги
    // проверки асинхронные (WebCrypto) и идут строго по очереди.
    let checking = key !== undefined
    let hubProof = ''
    let handshake: Promise<void> = Promise.resolve()
    const step = async (kind: string | undefined, value: string | undefined) => {
      if (kind === AUTH_HUB && value && key && !hubProof) {
        const nonce = newNonce()

        hubProof = await proofOf(key, 'hub', nonce)
        socket.write(`${AUTH_HOST} ${await proofOf(key, 'host', value)} ${nonce}\n`)
      } else if (kind === AUTH_OK && value && hubProof && sameProof(value, hubProof)) {
        checking = false
        this.markConnected()
      } else {
        this.io.log('the IDE did not prove the bridge key')
        socket.destroy()
      }
    }

    this.socket = socket
    this.forwarded = new Set()
    socket.setEncoding('utf8')
    socket.on('connect', () => {
      if (!checking) this.markConnected()
    })
    socket.on('data', (chunk: string) => {
      try {
        for (const line of lines.push(chunk)) {
          if (!checking) {
            this.toChrome(line)
            continue
          }

          const [kind, value] = line.split(' ')

          handshake = handshake.then(() => step(kind, value))
        }
      } catch (error) {
        this.io.log(`bad line from the IDE: ${String(error)}`)
        socket.destroy()
      }
    })
    // Ошибка соединения приходит перед close: сам повтор - в close.
    socket.on('error', () => undefined)
    socket.on('close', () => {
      this.connected = false

      if (this.socket === socket) {
        this.socket = null
        this.forwarded = new Set()
      }

      if (this.closed) return

      this.report('ide-offline')
      this.retry = setTimeout(() => {
        this.retry = null
        this.dial()
      }, RECONNECT_MS)
    })
  }

  /**
   * Строка IDE → кадр Chrome. Больше 1 МБ Chrome не примет и закроет порт - вместо этого IDE
   * получает отказ на свой запрос.
   */
  private toChrome(line: string): void {
    const message = parseLine(line)
    const requestId =
      isRecord(message) && message['type'] === 'request' && typeof message['id'] === 'number'
        ? message['id']
        : null

    if (new TextEncoder().encode(line).length <= HOST_TO_CHROME_MAX_BYTES) {
      if (requestId !== null) this.forwarded.add(requestId)

      this.io.toChrome(encodeFrameJson(line))

      return
    }

    if (requestId !== null) {
      this.socket?.write(
        encodeLine({
          type: 'response',
          id: requestId,
          error: {
            code: 'bad-request',
            message: 'The request is larger than Chrome accepts (1 MB).',
          },
        }),
      )
    }
  }

  /** Расширению - только смена состояния, а не каждая попытка дозвониться. */
  private report(status: HostStatus): void {
    if (this.status === status) return

    this.status = status

    const message: HostStatusMessage = { type: 'host', status }

    this.io.toChrome(encodeFrame(message))
  }
}

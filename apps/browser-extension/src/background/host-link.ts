import {
  HOST_NAMES,
  CHROME_TO_HOST_MAX_BYTES,
} from '@agentic-workstation/browser-protocol/protocol'
import type {
  HostChannel,
  HelloMessage,
  ExtensionToIde,
  RequestMessage,
  SessionSummary,
  WelcomeMessage,
  HostToExtension,
} from '@agentic-workstation/browser-protocol/protocol'

import type { LinkView, LinkState } from '../common/messages'
import { MethodError } from './method-error'

/** Длина строки в UTF-8 - без копии в байты: ответ может быть десятками мегабайт. */
const utf8Length = (text: string): number => {
  let bytes = 0

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)

    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code < 0xdc00) {
      bytes += 4
      index += 1
    } else bytes += 3
  }

  return bytes
}

/** Переподключение после падения host: сначала быстро, потом не чаще раза в полминуты. */
const RETRY_MIN_MS = 1000
const RETRY_MAX_MS = 30_000

/**
 * Проба host, которого не было (окно значка открыли), - не чаще раза в пять секунд: проба меняет
 * состояние связи, окно перерисовывается, и без паузы проба и перерисовка качали бы друг друга.
 */
export const PROBE_EVERY_MS = 5_000

export type LinkDeps = {
  hello: () => Promise<HelloMessage>
  handle: (request: RequestMessage, link: HostLink) => Promise<unknown>
  welcome: (welcome: WelcomeMessage, link: HostLink) => void
  /** IDE ушла или host упал: её отладчики и рамки надо снять. */
  gone: (link: HostLink) => void
  changed: () => void
}

/**
 * Связь с одной IDE через её native host (установленная и dev - каждая своя, ADR 0040).
 * Открытый порт native messaging держит сервис-воркер живым (Chrome 105+). Host не
 * установлен - ждём, пока откроют окно значка (IDE поставит host, когда человек добавит
 * коннектор Browser); host упал - переподключаемся сами.
 */
export class HostLink {
  state: LinkState = 'connecting'
  ideVersion: string | null = null
  sessions: SessionSummary[] = []
  private port: chrome.runtime.Port | null = null
  private retryMs = RETRY_MIN_MS
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private probedAt = Number.NEGATIVE_INFINITY

  constructor(
    readonly channel: HostChannel,
    private readonly deps: LinkDeps,
  ) {}

  view(): LinkView {
    return {
      channel: this.channel,
      state: this.state,
      ideVersion: this.ideVersion,
      sessions: this.sessions,
    }
  }

  connect(): void {
    if (this.port) return

    clearTimeout(this.retryTimer)

    // Проба отсутствующего host - тихая: строка такой связи в окне скрыта, и «Connecting» на
    // мгновение показал бы её и снова спрятал. Нашёлся host - состояние скажут его сообщения.
    if (this.state !== 'host-missing') this.setState('connecting')

    const port = chrome.runtime.connectNative(HOST_NAMES[this.channel])

    this.port = port
    port.onMessage.addListener((message: HostToExtension) => {
      void this.receive(message)
    })
    port.onDisconnect.addListener(() => this.disconnected(chrome.runtime.lastError?.message ?? ''))
  }

  /** Окно значка открыли: host, которого не было, мог появиться. */
  retry(now = Date.now()): void {
    if (this.state !== 'host-missing' && this.state !== 'host-error') return
    if (now - this.probedAt < PROBE_EVERY_MS) return

    this.probedAt = now
    this.connect()
  }

  send(message: ExtensionToIde): void {
    if (this.state === 'connected') this.port?.postMessage(message)
  }

  /** Поменялось то, что IDE знает из hello (метка запуска Chrome), - сказать ей заново. */
  async rehello(): Promise<void> {
    if (this.state === 'connected') this.port?.postMessage(await this.deps.hello())
  }

  private disconnected(error: string): void {
    const wasLive = this.state === 'connected'

    this.port = null
    this.dropIde(wasLive)

    if (/not found|forbidden/i.test(error)) {
      this.setState('host-missing')

      return
    }

    this.setState('host-error')
    this.retryTimer = setTimeout(() => this.connect(), this.retryMs)
    this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS)
  }

  private async receive(message: HostToExtension): Promise<void> {
    if (message.type === 'host') {
      if (message.status === 'connected') {
        this.port?.postMessage(await this.deps.hello())
      } else {
        this.dropIde(this.state === 'connected')
        this.setState('ide-offline')
      }

      return
    }

    if (message.type === 'welcome') {
      this.retryMs = RETRY_MIN_MS
      this.ideVersion = message.ideVersion
      this.setState('connected')
      this.deps.welcome(message, this)

      return
    }

    try {
      const result = await this.deps.handle(message, this)

      this.post({ type: 'response', id: message.id, result: result ?? null })
    } catch (error) {
      this.post({
        type: 'response',
        id: message.id,
        error: {
          code: error instanceof MethodError ? error.code : 'failed',
          message: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  /**
   * Ответ IDE. Больше предела Chrome не пропустит в host и закроет порт - вместо этого отказ
   * too-large на этот запрос, связь остаётся.
   */
  private post(message: Extract<ExtensionToIde, { type: 'response' }>): void {
    if (utf8Length(JSON.stringify(message)) <= CHROME_TO_HOST_MAX_BYTES) {
      this.port?.postMessage(message)

      return
    }

    this.port?.postMessage({
      type: 'response',
      id: message.id,
      error: {
        code: 'too-large',
        message: 'The answer is larger than Chrome passes to the IDE (64 MB).',
      },
    })
  }

  private dropIde(wasLive: boolean): void {
    this.ideVersion = null
    this.sessions = []

    if (wasLive) this.deps.gone(this)
  }

  private setState(state: LinkState): void {
    if (this.state === state) return

    this.state = state
    this.deps.changed()
  }
}

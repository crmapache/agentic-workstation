import type { VoiceRegion, VoiceLanguage, VoiceLanguageMode } from '@shared/voice'
import { VOICE_MIC_RATE } from '@shared/voice'

import type { Timer } from '../call/utterances'
import type { DeepgramDial, DeepgramLink } from './deepgram-link'
import { deepgramHost } from './deepgram-link'
import type { FluxTurn } from './flux-turn'
import { parseFluxTurn } from './flux-turn'

/** Паузы переподключения к Flux (spec, «Состояния, ошибки»): четвёртый отказ - конец. */
const RETRY_MS = [500, 1000, 2000, 4000] as const
/** Сколько микрофона копится, пока соединения нет: 5 с PCM16 16 кГц. */
const BUFFER_BYTES = VOICE_MIC_RATE * 2 * 5

/** Распознавание оборвалось и переподключается, вернулось или не вернулось совсем. */
export type ListenTrouble = 'reconnecting' | 'restored' | 'failed'

export type FluxListenOptions = {
  key: string
  region: VoiceRegion
  mode: VoiceLanguageMode
  /** Ожидаемые языки мультирежима; пусто - автоопределение без подсказок. */
  hints: readonly VoiceLanguage[]
  dial: DeepgramDial
  timer: Timer
  onTurn: (turn: FluxTurn) => void
  onTrouble: (trouble: ListenTrouble) => void
}

/**
 * Адрес Flux STT: всегда `flux-general-multi` - у выбранного языка одна подсказка, у мультирежима
 * - ожидаемые языки (spec, таблица «Режим»). Звук - linear16 16 кГц без перекодирования.
 */
export const listenUrl = (
  region: VoiceRegion,
  mode: VoiceLanguageMode,
  hints: readonly VoiceLanguage[],
): string => {
  const params = new URLSearchParams({
    model: 'flux-general-multi',
    encoding: 'linear16',
    sample_rate: String(VOICE_MIC_RATE),
  })

  for (const hint of mode === 'multi' ? hints : [mode]) params.append('language_hint', hint)

  return `wss://${deepgramHost(region)}/v2/listen?${params.toString()}`
}

/**
 * Поток микрофона в Flux STT и ходы обратно. Соединение оборвалось - переподключается с
 * паузами, а микрофон за это время копится (до 5 с) и уходит следом: человек не повторяет.
 */
export class FluxListen {
  private link: DeepgramLink | null = null
  private isOpen = false
  private stopped = false
  private attempt = 0
  private buffer: Uint8Array[] = []
  private buffered = 0
  private cancelRetry: (() => void) | null = null

  constructor(private readonly options: FluxListenOptions) {}

  start(): void {
    this.connect()
  }

  send(pcm: Uint8Array): void {
    if (this.stopped) return
    if (this.isOpen && this.link) {
      this.link.send(pcm)

      return
    }

    this.buffer.push(pcm)
    this.buffered += pcm.byteLength

    while (this.buffered > BUFFER_BYTES) {
      const oldest = this.buffer.shift()

      if (!oldest) break
      this.buffered -= oldest.byteLength
    }
  }

  /** Новые ожидаемые языки посреди звонка (Configure). */
  configure(hints: readonly VoiceLanguage[]): void {
    if (this.options.mode !== 'multi' || !this.isOpen) return

    this.link?.send(JSON.stringify({ type: 'Configure', language_hints: hints }))
  }

  stop(): void {
    if (this.stopped) return

    this.stopped = true
    this.cancelRetry?.()
    this.cancelRetry = null
    if (this.isOpen) this.link?.send(JSON.stringify({ type: 'CloseStream' }))
    this.link?.close()
    this.link = null
  }

  private connect(): void {
    const { key, region, mode, hints, dial } = this.options

    this.link = dial(listenUrl(region, mode, hints), key, {
      open: () => this.opened(),
      text: (data) => this.message(data),
      audio: () => undefined,
      close: () => this.closed(),
    })
  }

  private opened(): void {
    const restored = this.attempt > 0

    this.isOpen = true
    this.attempt = 0

    for (const pcm of this.buffer) this.link?.send(pcm)

    this.buffer = []
    this.buffered = 0
    if (restored) this.options.onTrouble('restored')
  }

  private message(data: string): void {
    let message: unknown

    try {
      message = JSON.parse(data)
    } catch {
      return
    }

    const turn = parseFluxTurn(message)

    if (turn) this.options.onTurn(turn)
    else if (isError(message)) console.warn('Voice: Flux STT error', message)
  }

  private closed(): void {
    this.isOpen = false
    this.link = null

    if (this.stopped) return

    const wait = RETRY_MS[this.attempt]

    if (wait === undefined) {
      this.stopped = true
      this.options.onTrouble('failed')

      return
    }

    if (this.attempt === 0) this.options.onTrouble('reconnecting')

    this.attempt += 1
    this.cancelRetry = this.options.timer(() => {
      this.cancelRetry = null
      this.connect()
    }, wait)
  }
}

const isError = (message: unknown): boolean =>
  typeof message === 'object' &&
  message !== null &&
  (message as Record<string, unknown>)['type'] === 'Error'

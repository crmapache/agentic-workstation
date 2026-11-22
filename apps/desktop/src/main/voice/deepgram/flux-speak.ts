import type { VoiceRegion } from '@shared/voice'
import { VOICE_PLAY_RATE } from '@shared/voice'

import type { Timer } from '../call/utterances'
import type { DeepgramDial, DeepgramLink } from './deepgram-link'
import { deepgramHost } from './deepgram-link'

/** Байт PCM16 на миллисекунду ответа. */
export const PLAY_BYTES_PER_MS = (VOICE_PLAY_RATE * 2) / 1000
/** Сервер закрывает сессию после 60 с без сообщений клиента (NET-0004): напоминаем чаще. */
const KEEPALIVE_MS = 30_000

/**
 * Что синтез отдаёт звонку: начался ход (ответ), кусок звука, ход прозвучал целиком, ход
 * оборван перебиванием - с тем, что успело прозвучать.
 */
export type SpeakEvent =
  | { kind: 'started' }
  | { kind: 'audio'; pcm: Buffer }
  | { kind: 'done' }
  | { kind: 'interrupted'; spoken: string; remaining: string }
  /** Соединение упало посреди ответа: недозвучавшее пропало, продолжать его нельзя. */
  | { kind: 'lost' }

export type FluxSpeakOptions = {
  key: string
  region: VoiceRegion
  voice: string
  speed: number
  dial: DeepgramDial
  timer: Timer
  onEvent: (event: SpeakEvent) => void
}

export const speakUrl = (region: VoiceRegion, voice: string, speed: number): string => {
  const params = new URLSearchParams({
    model: voice,
    encoding: 'linear16',
    sample_rate: String(VOICE_PLAY_RATE),
  })

  if (speed !== 1) params.set('speed', speed.toFixed(2))

  return `wss://${deepgramHost(region)}/v2/speak?${params.toString()}`
}

type Message = Record<string, unknown>

const parse = (data: string): Message | null => {
  try {
    const value: unknown = JSON.parse(data)

    return typeof value === 'object' && value !== null ? (value as Message) : null
  } catch {
    return null
  }
}

/**
 * Синтез одного голоса Flux TTS (проба 2026-11-21): ответ агента - один ход, фразы уходят
 * `Speak` по мере появления и звучат сразу, `Flush` - конец ответа. Перебивание - `Interrupt` с
 * местом в сессии; после него Deepgram считает сессию от этого места, а звук, который ещё
 * летит, выкидывается до `SpeechInterrupted`. Соединение упало - откроется на следующей фразе.
 */
export class FluxSpeak {
  private link: DeepgramLink | null = null
  private isOpen = false
  private stopped = false
  private outbox: string[] = []
  /** Где сессия Deepgram сейчас: сумма звука, как его считает сервер. */
  private sessionMs = 0
  private discarding = false
  /** Ход принимает фразы: Speak ушёл, Flush ещё нет. */
  private composing = false
  /** Ходы, отправленные и ещё не дозвучавшие (SpeechMetadata не пришёл). */
  private pendingTurns = 0
  private cancelKeepalive: (() => void) | null = null
  private speed: number

  constructor(private readonly options: FluxSpeakOptions) {
    this.speed = options.speed
  }

  /**
   * Место в сессии, с которого пойдёт следующий звук. Звонок запоминает его у начала ответа:
   * следующий ответ может уже синтезироваться, пока человек слушает этот.
   */
  get position(): number {
    return this.sessionMs
  }

  /** Есть ли ходы, которые ещё звучат или ждут очереди. */
  get busy(): boolean {
    return this.pendingTurns > 0
  }

  /** Открыть заранее: первая фраза ответа не ждёт рукопожатия. */
  warm(): void {
    if (!this.link && !this.stopped) this.connect()
  }

  /** Фраза ответа; ход открывается первой фразой и копит следующие. */
  say(text: string): void {
    if (!text.trim()) return

    if (!this.composing) {
      this.composing = true
      this.pendingTurns += 1
    }

    this.push({ type: 'Speak', text: `${text} ` })
  }

  /** Ответ закончился - дозвучать всё, что накоплено. */
  finish(): void {
    if (!this.composing) return

    this.composing = false
    this.push({ type: 'Flush' })
  }

  /**
   * Оборвать то, что звучит, на месте sessionMs от начала сессии. Deepgram не принял (звука
   * ещё не было, прошлый Interrupt в пути) - соединение сбрасывается целиком, иначе текст
   * продолжил бы звучать.
   */
  interrupt(sessionMs: number): void {
    if (this.pendingTurns === 0) return

    this.discarding = true
    this.composing = false
    this.push({
      type: 'Interrupt',
      playback_offset: { type: 'time_ms', value: Math.round(sessionMs) },
    })
  }

  /** Скорость на лету: со следующего куска речи (Configure), и напоминание держит её же. */
  setSpeed(speed: number): void {
    this.speed = speed
    this.push({ type: 'Configure', speed })
  }

  stop(): void {
    this.stopped = true
    this.cancelKeepalive?.()
    this.link?.close()
    this.link = null
  }

  private push(message: Message): void {
    const data = JSON.stringify(message)

    if (this.isOpen && this.link) {
      this.link.send(data)

      return
    }

    this.outbox.push(data)
    this.warm()
  }

  private connect(): void {
    const { key, region, voice, dial } = this.options

    this.link = dial(speakUrl(region, voice, this.speed), key, {
      open: () => {
        this.isOpen = true
        for (const data of this.outbox) this.link?.send(data)
        this.outbox = []
        this.keepalive()
      },
      text: (data) => this.message(parse(data)),
      audio: (pcm) => this.audio(pcm),
      close: () => this.closed(),
    })
  }

  private keepalive(): void {
    this.cancelKeepalive?.()
    this.cancelKeepalive = this.options.timer(() => {
      if (!this.isOpen) return
      this.link?.send(JSON.stringify({ type: 'Configure', speed: this.speed }))
      this.keepalive()
    }, KEEPALIVE_MS)
  }

  private audio(pcm: Buffer): void {
    if (this.discarding) return

    this.sessionMs += pcm.byteLength / PLAY_BYTES_PER_MS
    this.options.onEvent({ kind: 'audio', pcm })
  }

  private message(message: Message | null): void {
    switch (message?.['type']) {
      case 'SpeechStarted':
        this.options.onEvent({ kind: 'started' })
        break
      case 'SpeechMetadata':
        this.pendingTurns = Math.max(0, this.pendingTurns - 1)
        this.options.onEvent({ kind: 'done' })
        break
      case 'SpeechInterrupted':
        // Interrupt снимает и ходы, ждавшие очереди (проба 2026-11-21).
        this.discarding = false
        this.pendingTurns = 0
        this.sessionMs = numberOf(message['audio_played_ms'], this.sessionMs)
        this.options.onEvent({
          kind: 'interrupted',
          spoken: stringOf(message['text_spoken']),
          remaining: stringOf(message['text_remaining']),
        })
        break
      case 'Warning':
        if (this.discarding) this.reset()
        break
      case 'Error':
        console.warn('Voice: Flux TTS error', message)
        break
    }
  }

  /** Interrupt не принят (звука ещё не было, прошлый в пути): начать сессию заново. */
  private reset(): void {
    this.link?.close()
    this.link = null
    this.isOpen = false
    this.outbox = []
    this.discarding = false
    this.composing = false
    this.pendingTurns = 0
    this.sessionMs = 0
    this.options.onEvent({ kind: 'interrupted', spoken: '', remaining: '' })
  }

  private closed(): void {
    const wasTurn = this.pendingTurns > 0 && !this.discarding

    this.isOpen = false
    this.link = null
    // Ждавшее открытия принадлежит пропавшим ходам: новое соединение начнёт с чистого.
    this.outbox = []
    this.sessionMs = 0
    this.composing = false
    this.pendingTurns = 0
    this.discarding = false
    this.cancelKeepalive?.()
    // Оборвалось посреди ответа - звонок не должен ждать его конца вечно.
    if (wasTurn && !this.stopped) this.options.onEvent({ kind: 'lost' })
  }
}

const numberOf = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '')

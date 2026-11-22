import type { VoiceLanguage, VoiceLanguageMode } from '@shared/voice'
import { isVoiceLanguage } from '@shared/voice'

import type { FluxTurn, FluxWord } from '../deepgram/flux-turn'
import { confidenceOf } from '../deepgram/flux-turn'
import { isBackchannel, wordsOf } from './voice-words'

/** Реплика человека, готовая уйти в чат. */
export type Utterance = { text: string; language: VoiceLanguage }

/** Меньше стольких слов язык берётся из прошлой реплики: «ок» не переключает разговор. */
const LANGUAGE_MIN_WORDS = 3
/**
 * Короткая реплика (меньше трёх слов) ждёт столько продолжения: Flux режет «Привет.» с паузой
 * после него в отдельный ход, а в чат это одно сообщение.
 */
export const MERGE_MS = 1000
/** Одно-два слова с уверенностью ниже этой - скорее шум, в чат не идут (spec). */
const NOISE_CONFIDENCE = 0.5

/**
 * Язык реплики (spec, «Как выбирается язык»): выбранный - всегда он; в мультирежиме - первый
 * из языков Flux, а у короткой реплики - язык прошлой.
 */
export const pickLanguage = (
  mode: VoiceLanguageMode,
  languages: readonly string[],
  words: number,
  previous: VoiceLanguage | null,
): VoiceLanguage => {
  if (mode !== 'multi') return mode

  const detected = languages.find(isVoiceLanguage)

  if (words < LANGUAGE_MIN_WORDS && previous) return previous

  return detected ?? previous ?? 'en'
}

export type Timer = (run: () => void, ms: number) => () => void

type Held = { text: string; words: FluxWord[]; languages: string[] }

export type UtteranceDeskOptions = {
  mode: VoiceLanguageMode
  timer: Timer
  /** Живой текст реплики, пока человек говорит; пусто - замолчал. */
  onHeard: (text: string) => void
  onUtterance: (utterance: Utterance) => void
  /** Говорит или работает ли агент: поддакивание тогда не реплика. */
  isAgentBusy: () => boolean
}

const join = (...parts: string[]) => parts.filter(Boolean).join(' ')

/**
 * Ходы Flux в реплики чата: живой текст, пока человек говорит, склейка короткого хода со
 * следующим, отсев шума и поддакивания, язык реплики.
 */
export class UtteranceDesk {
  private held: Held | null = null
  private dropHold: (() => void) | null = null
  private language: VoiceLanguage | null = null

  constructor(private readonly options: UtteranceDeskOptions) {}

  /** Язык последней реплики, ушедшей в чат. */
  get lastLanguage(): VoiceLanguage | null {
    return this.language
  }

  turn(turn: FluxTurn): void {
    if (turn.event !== 'EndOfTurn') {
      // Человек продолжил - короткий ход ждёт склейки, а не таймера.
      this.dropHold?.()
      this.dropHold = null
      this.options.onHeard(join(this.held?.text ?? '', turn.transcript))

      return
    }

    const held: Held = {
      text: join(this.held?.text ?? '', turn.transcript.trim()),
      words: [...(this.held?.words ?? []), ...turn.words],
      languages: turn.languages.length > 0 ? turn.languages : (this.held?.languages ?? []),
    }

    this.held = null

    if (wordsOf(held.text).length === 0) {
      this.options.onHeard('')

      return
    }

    if (wordsOf(held.text).length < LANGUAGE_MIN_WORDS) {
      this.held = held
      this.options.onHeard(held.text)
      this.dropHold?.()
      this.dropHold = this.options.timer(() => this.release(), MERGE_MS)

      return
    }

    this.emit(held)
  }

  /** Отдать то, что ждёт склейки, сразу: звонок кончается. */
  flush(): void {
    this.release()
  }

  /** Забыть то, что ждёт склейки: человека перебили на полуслове или реплика ушла иначе. */
  reset(): void {
    this.dropHold?.()
    this.dropHold = null
    this.held = null
  }

  private release(): void {
    this.dropHold = null

    const held = this.held

    this.held = null
    if (held) this.emit(held)
  }

  private emit(held: Held): void {
    const words = wordsOf(held.text).length

    this.options.onHeard('')

    if (this.options.isAgentBusy() && isBackchannel(held.text)) return
    if (words <= 2 && confidenceOf(held.words) < NOISE_CONFIDENCE) return

    const language = pickLanguage(this.options.mode, held.languages, words, this.language)

    this.language = language
    this.options.onUtterance({ text: held.text, language })
  }
}

import type { VoiceLanguage, VoiceLanguageMode } from '@shared/voice'
import { isVoiceLanguage } from '@shared/voice'

import type { FluxTurn, FluxWord } from '../deepgram/flux-turn'
import { confidenceOf } from '../deepgram/flux-turn'
import { readLanguage } from '../speech/text-language'
import { wordsOf, isStopOnly, isBackchannel } from './voice-words'

/** Реплика человека, готовая уйти в чат. */
export type Utterance = { text: string; language: VoiceLanguage }

/** Меньше стольких слов язык берётся из прошлой реплики: «ок» не переключает разговор. */
const LANGUAGE_MIN_WORDS = 3
/**
 * Столько тишины после последнего слова реплика ждёт продолжения, прежде чем уйти в чат
 * (владелец, 2026-11-22). Flux закрывает ход и на короткой паузе посреди фразы, и фраза уходила
 * в чат двумя сообщениями. Заговорил раньше - следующий ход приклеивается к этому.
 */
export const PAUSE_MS = 3000
/** Одно-два слова с уверенностью ниже этой - скорее шум, в чат не идут (spec). */
const NOISE_CONFIDENCE = 0.5

/**
 * Язык реплики (spec, «Как выбирается язык»): выбранный - всегда он; в мультирежиме - по словам
 * реплики, а ярлык Flux решает, только когда слова не решают сами (латиница, похожие языки). У
 * короткой реплики - язык прошлой. Ярлыку Flux одному не верим: русскую реплику «Ok, a теперь
 * посмотри…» он назвал pt (звонок 2026-11-21), и пометка велела агенту ответить по-португальски.
 */
export const pickLanguage = (
  mode: VoiceLanguageMode,
  languages: readonly string[],
  text: string,
  previous: VoiceLanguage | null,
): VoiceLanguage => {
  if (mode !== 'multi') return mode
  if (wordsOf(text).length < LANGUAGE_MIN_WORDS && previous) return previous

  const read = readLanguage(text)

  if (read.sure && read.language) return read.language

  return languages.find(isVoiceLanguage) ?? read.language ?? previous ?? 'en'
}

export type Timer = (run: () => void, ms: number) => () => void

type Held = { text: string; words: FluxWord[]; languages: string[] }

export type UtteranceDeskOptions = {
  mode: VoiceLanguageMode
  timer: Timer
  now: () => number
  /** Живой текст реплики, пока человек говорит; пусто - замолчал. */
  onHeard: (text: string) => void
  onUtterance: (utterance: Utterance) => void
  /** Говорит или работает ли агент: поддакивание тогда не реплика. */
  isAgentBusy: () => boolean
}

const join = (...parts: string[]) => parts.filter(Boolean).join(' ')

/**
 * Ходы Flux в реплики чата: живой текст, пока человек говорит, склейка ходов до паузы после
 * последнего слова, отсев шума и поддакивания, язык реплики.
 */
export class UtteranceDesk {
  private held: Held | null = null
  private dropHold: (() => void) | null = null
  private language: VoiceLanguage | null = null
  /** Слова текущего хода Flux и когда среди них появилось последнее новое. */
  private turnWords = ''
  private heardAt = 0

  constructor(private readonly options: UtteranceDeskOptions) {}

  /** Язык последней реплики, ушедшей в чат. */
  get lastLanguage(): VoiceLanguage | null {
    return this.language
  }

  turn(turn: FluxTurn): void {
    this.noteWords(turn.transcript)

    if (turn.event !== 'EndOfTurn') {
      // Человек продолжил - то, что ждёт, приклеится к этому ходу, а не уйдёт по таймеру.
      if (this.turnWords) this.cancelRelease()
      this.options.onHeard(join(this.held?.text ?? '', turn.transcript))

      return
    }

    this.turnWords = ''

    const held: Held = {
      text: join(this.held?.text ?? '', turn.transcript.trim()),
      words: [...(this.held?.words ?? []), ...turn.words],
      languages: turn.languages.length > 0 ? turn.languages : (this.held?.languages ?? []),
    }

    this.held = held

    if (wordsOf(held.text).length === 0) {
      this.held = null
      this.options.onHeard('')

      return
    }

    // «Стоп» и «подожди» сами по себе паузы не ждут: остановка не должна ждать три секунды.
    if (isStopOnly(held.text)) {
      this.cancelRelease()
      this.release()

      return
    }

    this.options.onHeard(held.text)
    this.waitForPause()
  }

  /**
   * Ход поверх ответа агента отброшен (эхо, поддакивание) - его слова не реплика. То, что
   * человек сказал до него, по-прежнему уходит после паузы.
   */
  skip(): void {
    this.turnWords = ''
    this.options.onHeard(this.held?.text ?? '')
    if (this.held) this.waitForPause()
  }

  /** Отдать то, что ждёт паузы, сразу: звонок кончается. */
  flush(): void {
    this.cancelRelease()
    this.release()
  }

  /** Новое слово хода - отметка времени: пауза считается от последнего сказанного слова. */
  private noteWords(transcript: string): void {
    const words = wordsOf(transcript).join(' ')

    if (words === this.turnWords) return

    this.turnWords = words
    if (words) this.heardAt = this.options.now()
  }

  private waitForPause(): void {
    this.cancelRelease()

    const left = PAUSE_MS - (this.options.now() - this.heardAt)

    // Flux закрыл ход позже паузы - ждать больше нечего.
    if (left <= 0) {
      this.release()

      return
    }

    this.dropHold = this.options.timer(() => this.release(), left)
  }

  private cancelRelease(): void {
    this.dropHold?.()
    this.dropHold = null
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

    const language = pickLanguage(this.options.mode, held.languages, held.text, this.language)

    this.language = language
    this.options.onUtterance({ text: held.text, language })
  }
}

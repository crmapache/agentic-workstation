import type { VoiceBargeIn, VoiceLanguage, VoiceLanguageMode, VoiceRegion } from '@shared/voice'

import type { DeepgramDial } from '../deepgram/deepgram-link'
import type { ListenTrouble } from '../deepgram/flux-listen'
import { FluxListen } from '../deepgram/flux-listen'
import type { FluxTurn } from '../deepgram/flux-turn'
import { BARGE_IN_WINDOW_MS, judgeBargeIn } from './barge-in'
import type { Timer, Utterance } from './utterances'
import { UtteranceDesk } from './utterances'

/** Что делать с ответом, пока человек, кажется, заговорил поверх. */
export type BargeIn = 'duck' | 'unduck' | 'stop'

export type CallEarsOptions = {
  key: string
  region: VoiceRegion
  mode: VoiceLanguageMode
  hints: readonly VoiceLanguage[]
  bargeIn: VoiceBargeIn
  dial: DeepgramDial
  timer: Timer
  /** Говорит ли сейчас агент (рот звонка) и что он сказал только что. */
  isSpeaking: () => boolean
  recentlySaid: () => string
  /** Говорит или работает ли агент: поддакивание тогда не реплика. */
  isAgentBusy: () => boolean
  onHeard: (text: string) => void
  onUtterance: (utterance: Utterance) => void
  onBargeIn: (action: BargeIn) => void
  onTrouble: (trouble: ListenTrouble) => void
}

/**
 * Уши звонка: микрофон - в Flux STT, ходы - в реплики чата. Пока агент говорит, ход сначала
 * проверяется на перебивание (spec, «Перебивание», два шага): начало реплики приглушает ответ,
 * подтверждённые слова обрывают его, окно без слов возвращает громкость. Реплика поверх ответа,
 * которая его не оборвала (эхо, «угу»), в чат не идёт.
 */
export class CallEars {
  private readonly listen: FluxListen
  private readonly desk: UtteranceDesk
  private closeWindow: (() => void) | null = null
  private ducked = false

  constructor(private readonly options: CallEarsOptions) {
    const { key, region, mode, hints, dial, timer } = options

    this.desk = new UtteranceDesk({
      mode,
      timer,
      onHeard: options.onHeard,
      onUtterance: options.onUtterance,
      isAgentBusy: options.isAgentBusy,
    })
    this.listen = new FluxListen({
      key,
      region,
      mode,
      hints,
      dial,
      timer,
      onTurn: (turn) => this.turn(turn),
      onTrouble: options.onTrouble,
    })
  }

  get lastLanguage(): VoiceLanguage | null {
    return this.desk.lastLanguage
  }

  start(): void {
    this.listen.start()
  }

  mic(pcm: Uint8Array): void {
    this.listen.send(pcm)
  }

  /** Звонок кончается: то, что ждало склейки, уходит. */
  flush(): void {
    this.desk.flush()
  }

  stop(): void {
    this.endWindow()
    this.listen.stop()
  }

  private turn(turn: FluxTurn): void {
    if (!this.options.isSpeaking()) {
      this.endWindow()
      this.desk.turn(turn)

      return
    }

    const verdict = judgeBargeIn(this.options.bargeIn, turn, this.options.recentlySaid())

    if (verdict === 'stop') {
      this.endWindow()
      this.options.onBargeIn('stop')
      // Агент замолчал - реплика идёт обычным путём: живой текст и чат.
      this.desk.turn(turn)

      return
    }

    if (turn.event === 'EndOfTurn') {
      // Эхо или поддакивание поверх ответа - не реплика.
      this.endWindow()
      this.desk.reset()
      this.options.onHeard('')

      return
    }

    if (verdict === 'wait' && turn.event === 'StartOfTurn' && !this.closeWindow) {
      this.ducked = true
      this.options.onBargeIn('duck')
      this.closeWindow = this.options.timer(() => {
        this.closeWindow = null
        this.unduck()
      }, BARGE_IN_WINDOW_MS)
    }
  }

  private endWindow(): void {
    this.closeWindow?.()
    this.closeWindow = null
    this.unduck()
  }

  private unduck(): void {
    if (!this.ducked) return

    this.ducked = false
    this.options.onBargeIn('unduck')
  }
}

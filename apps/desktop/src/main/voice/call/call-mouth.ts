import type { VoiceRegion, VoiceLanguage } from '@shared/voice'

import type { SampleRequest } from '../voice-samples'
import type { DeepgramDial } from '../deepgram/deepgram-link'
import type { SpeakEvent } from '../deepgram/flux-speak'
import { FluxSpeak, PLAY_BYTES_PER_MS } from '../deepgram/flux-speak'
import { SentenceFeed } from '../speech/sentence-feed'
import { speakableLines } from '../speech/speakable'
import { readLanguage, textLanguage } from '../speech/text-language'
import type { Timer } from './utterances'
import type { VoiceEndpoint } from './voice-endpoint'

/** Сколько сказанного помнить для проверки эха: последние фразы, не весь ответ. */
const ECHO_SENTENCES = 4
/** Конечная точка не сообщила, что дослушано, - считать ответ прозвучавшим через столько сверх. */
const DRAIN_GRACE_MS = 400

/** Ответ агента в озвучке: один элемент ленты - один ход синтеза. */
type Answer = {
  itemId: string
  /** Голос ответа; null - язык текста ещё не ясен, законченные фразы ждут в waiting. */
  voice: string | null
  language: VoiceLanguage | null
  feed: SentenceFeed
  /** Законченные фразы, которые ждут голоса. */
  waiting: string[]
  said: string
  closed: boolean
  started: boolean
  done: boolean
  /** Место в сессии синтеза, где ответ начался (Interrupt считает от начала сессии). */
  sessionStart: number
  /** Где в потоке эпохи начался звук ответа и сколько его. */
  streamStart: number
  audioMs: number
  /**
   * Звук ответа целиком - в запас «Прочитать вслух» (ADR 0106); null - не копить: фраза звонка
   * или скорость сменили посреди ответа.
   */
  pcm: Buffer[] | null
  speed: number
}

/** Ответ, который прозвучал целиком: его звук годится кнопке «Прочитать вслух». */
export type SpokenAnswer = SampleRequest & { pcm: Uint8Array }

export type CallMouthOptions = {
  key: string
  region: VoiceRegion
  speed: number
  voices: Record<VoiceLanguage, string>
  dial: DeepgramDial
  timer: Timer
  endpoint: VoiceEndpoint
  /** Звонок заговорил или замолчал. */
  onSpeaking: (speaking: boolean) => void
  /** Ответ оборван: что из него успело прозвучать. */
  onCut: (itemId: string, spoken: string) => void
  /** Ответ ленты синтезирован целиком, без обрыва: его звук - в запас чтения вслух. */
  onSpoken?: ((spoken: SpokenAnswer) => void) | undefined
  /** С какой эпохи начать: рот после паузы продолжает счёт прежнего, а не с нуля. */
  epoch?: number | undefined
}

/**
 * Начало сказанного, которое прозвучало, по доле проигранного: Deepgram уже не оборвать (весь
 * звук хода у нас), и что человек услышал, считаем сами - словами, не буквами.
 */
export const heardPart = (said: string, ratio: number): string => {
  const words = said.split(/\s+/).filter(Boolean)

  return words.slice(0, Math.round(words.length * Math.min(1, Math.max(0, ratio)))).join(' ')
}

/**
 * Рот звонка: ответы агента - в Flux TTS по фразам, звук - конечной точке кадрами эпохи;
 * дослушано ли, говорит конечная точка. Перебили - Interrupt на месте, которое человек
 * слышит, новая эпоха и отчёт, что он успел услышать.
 */
export class CallMouth {
  private readonly speakers = new Map<string, FluxSpeak>()
  private answers: Answer[] = []
  private epoch = 0
  private frame = 0
  private sentMs = 0
  private playedMs = 0
  private speaking = false
  private recent: string[] = []
  private cutting: Answer | null = null
  /** Оборванные ответы: агент может дописывать их ещё секунду, озвучивать нельзя. */
  private readonly silenced = new Set<string>()
  private cancelDrain: (() => void) | null = null
  private speed: number
  /** Рот погашен (пауза, конец): синтез больше не открывается, что бы ни пришло. */
  private stopped = false

  constructor(private readonly options: CallMouthOptions) {
    this.speed = options.speed
    this.epoch = options.epoch ?? 0
  }

  /** Эпоха ответа сейчас: новый рот после паузы продолжает с неё. */
  get currentEpoch(): number {
    return this.epoch
  }

  /** Есть ли ответы - звучащие или ещё без звука: «Стоп» и «стоп» обрывают и их. */
  get hasAnswers(): boolean {
    return this.answers.length > 0
  }

  /** Скорость речи на лету (spec: «скорость и перебивание можно менять на лету»). */
  setSpeed(speed: number): void {
    this.speed = speed

    for (const speaker of this.speakers.values()) speaker.setSpeed(speed)

    // Ответ, который звучал на двух скоростях, ни одной из них не соответствует.
    for (const answer of this.answers) answer.pcm = null
  }

  get isSpeaking(): boolean {
    return this.speaking
  }

  /** Что агент сказал за последние фразы - для проверки эха. */
  get recentlySaid(): string {
    return this.recent.join(' ')
  }

  /** Открыть синтез голоса заранее, чтобы первая фраза не ждала рукопожатия. */
  warm(language: VoiceLanguage): void {
    if (this.stopped) return

    this.speakerOf(this.options.voices[language]).warm()
  }

  /**
   * Текст ответа подрос (или закончился): законченные фразы - в синтез. Голос - по языку текста
   * ответа (ADR 0106), а не реплики человека: распознавание ошибается в языке, и русский ответ
   * звучал португальским голосом. Пока ответ пишется и улик языка мало («Ok.»), фразы ждут
   * продолжения; ничья и пустой текст - язык реплики (hint).
   */
  answer(itemId: string, text: string, streaming: boolean, hint: VoiceLanguage): void {
    if (this.stopped || this.silenced.has(itemId)) return

    let answer = this.answers.find((known) => known.itemId === itemId)

    if (!answer) {
      if (!text.trim()) return
      answer = this.open(itemId, null)
    }

    if (answer.closed) return

    answer.waiting.push(...answer.feed.take(text, streaming))

    if (!answer.voice) {
      const speakable = speakableLines(text).join(' ')

      if (streaming && !readLanguage(speakable).sure) return

      this.choose(answer, textLanguage(speakable, hint))
      answer.pcm = []
    }

    this.speak(answer, streaming)
  }

  /** Сказать фразу от звонка (разрешение, «ты ещё тут?») - отдельным ответом, на её языке. */
  say(id: string, text: string, language: VoiceLanguage): void {
    if (this.stopped || this.silenced.has(id)) return
    if (this.answers.some((known) => known.itemId === id)) return

    const answer = this.open(id, language)

    answer.waiting.push(...answer.feed.take(text, false))
    this.speak(answer, false)
  }

  /** Конечная точка сообщила, сколько эпохи проиграно. */
  played(epoch: number, ms: number): void {
    if (epoch !== this.epoch) return

    this.playedMs = Math.max(this.playedMs, ms)
    this.settle()
  }

  /**
   * Человек перебил: оборвать то, что звучит, на месте, которое он слышит; всё, что ждало (и
   * ответы, у которых звука ещё нет), - выкинуть. Новая эпоха - конечная точка сбрасывает
   * непроигранное. Что услышано, говорит Deepgram, пока ход ещё синтезируется; ход уже весь у нас -
   * считаем сами по доле проигранного. always - кнопка «Стоп»: новая эпоха и сигнал конечной
   * точке, даже если рот считает, что всё уже прозвучало, - конечная точка могла ещё играть
   * хвост, а телефон, замолчавший у себя по нажатию, ждёт новой эпохи.
   */
  cut(always = false): void {
    if (!always && this.answers.length === 0 && !this.speaking) return

    const heard =
      this.answers.find(
        (answer) => answer.started && this.playedMs < answer.streamStart + answer.audioMs,
      ) ??
      this.answers.find((answer) => answer.started) ??
      null
    const offset = heard ? Math.max(0, this.playedMs - heard.streamStart) : 0
    const heardVoice = heard?.voice ?? null
    const askDeepgram =
      heard !== null && !heard.done && !!heardVoice && !!this.speakers.get(heardVoice)?.busy

    for (const [voice, speaker] of this.speakers) {
      if (askDeepgram && voice === heardVoice) speaker.interrupt(heard.sessionStart + offset)
      else if (speaker.busy) {
        speaker.stop()
        this.speakers.delete(voice)
      }
    }

    for (const answer of this.answers) this.silenced.add(answer.itemId)

    this.cutting = askDeepgram ? heard : null
    if (heard && !askDeepgram) {
      this.options.onCut(heard.itemId, heardPart(heard.said, offset / Math.max(1, heard.audioMs)))
    }
    this.answers = []
    this.epoch += 1
    this.frame = 0
    this.sentMs = 0
    this.playedMs = 0
    this.options.endpoint.cue({ kind: 'stopPlayback', epoch: this.epoch })
    this.setSpeaking(false)
  }

  stop(): void {
    this.stopped = true
    this.cancelDrain?.()

    for (const speaker of this.speakers.values()) speaker.stop()

    this.speakers.clear()
    this.answers = []
  }

  /** Новый ответ; language - язык известен заранее (фраза звонка), иначе его решит текст. */
  private open(itemId: string, language: VoiceLanguage | null): Answer {
    const answer: Answer = {
      itemId,
      voice: null,
      language: null,
      feed: new SentenceFeed(),
      waiting: [],
      said: '',
      closed: false,
      started: false,
      done: false,
      sessionStart: 0,
      streamStart: 0,
      audioMs: 0,
      pcm: null,
      speed: this.speed,
    }

    if (language) this.choose(answer, language)

    this.answers.push(answer)

    return answer
  }

  private choose(answer: Answer, language: VoiceLanguage): void {
    answer.language = language
    answer.voice = this.options.voices[language]
  }

  /** Ждавшие фразы - в синтез голоса ответа; текст кончился - конец хода. Нечего сказать - мимо. */
  private speak(answer: Answer, streaming: boolean): void {
    const { voice } = answer

    if (!voice) return

    if (!streaming && !answer.said && answer.waiting.length === 0) {
      // Ни одной фразы (только код или таблица) - и звучать нечему.
      this.drop(answer)

      return
    }

    const speaker = this.speakerOf(voice)

    for (const sentence of answer.waiting) {
      speaker.say(sentence)
      answer.said = `${answer.said} ${sentence}`.trim()
      this.remember(sentence)
    }

    answer.waiting = []

    if (!streaming) {
      answer.closed = true
      speaker.finish()
    }
  }

  private speakerOf(voice: string): FluxSpeak {
    const known = this.speakers.get(voice)

    if (known) return known

    const { key, region, dial, timer } = this.options
    const speaker: FluxSpeak = new FluxSpeak({
      key,
      region,
      voice,
      speed: this.speed,
      dial,
      timer,
      onEvent: (event) => this.event(voice, speaker, event),
    })

    this.speakers.set(voice, speaker)

    return speaker
  }

  private event(voice: string, speaker: FluxSpeak, event: SpeakEvent): void {
    if (event.kind === 'interrupted') {
      const cut = this.cutting

      this.cutting = null
      if (cut) this.options.onCut(cut.itemId, event.spoken)

      return
    }

    if (event.kind === 'lost') return this.lost(voice)

    const answer =
      event.kind === 'started'
        ? this.answers.find((known) => known.voice === voice && !known.started)
        : this.answers.find((known) => known.voice === voice && known.started && !known.done)

    if (!answer) return

    if (event.kind === 'started') {
      answer.started = true
      answer.sessionStart = speaker.position
      answer.streamStart = this.sentMs
      this.setSpeaking(true)
    } else if (event.kind === 'audio') {
      const ms = event.pcm.byteLength / PLAY_BYTES_PER_MS

      this.options.endpoint.play(event.pcm, this.epoch, this.frame)
      this.frame += 1
      this.sentMs += ms
      answer.audioMs += ms
      answer.pcm?.push(event.pcm)
    } else {
      answer.done = true
      this.keep(answer)
      this.settle()
    }
  }

  /** Ответ синтезирован целиком: звук - в запас чтения вслух, если он годится. */
  private keep(answer: Answer): void {
    const { pcm, language, voice, said, speed } = answer

    answer.pcm = null

    if (!pcm || pcm.length === 0 || !language || !voice || !said) return

    this.options.onSpoken?.({ language, voice, speed, text: said, pcm: Buffer.concat(pcm) })
  }

  /** Всё прозвучавшее и дослушанное - убрать; ничего не осталось - звонок замолчал. */
  private settle(): void {
    this.answers = this.answers.filter(
      (answer) => !(answer.done && this.playedMs >= answer.streamStart + answer.audioMs - 50),
    )
    this.cancelDrain?.()
    this.cancelDrain = null

    if (this.answers.length === 0) {
      this.setSpeaking(false)

      return
    }

    // Конечная точка молчит о проигранном (окно свёрнуто) - не висеть в «говорю» вечно.
    if (this.answers.every((answer) => answer.done)) {
      const left = Math.max(0, this.sentMs - this.playedMs) + DRAIN_GRACE_MS

      this.cancelDrain = this.options.timer(() => {
        this.playedMs = this.sentMs
        this.settle()
      }, left)
    }
  }

  /** Синтез голоса оборвался посреди ответа: его ответы недоговорены и больше не звучат. */
  private lost(voice: string): void {
    this.speakers.delete(voice)

    for (const answer of this.answers) {
      if (answer.voice === voice && !answer.done) this.silenced.add(answer.itemId)
    }

    this.answers = this.answers.filter((answer) => !this.silenced.has(answer.itemId))
    this.settle()
  }

  private drop(answer: Answer): void {
    this.answers = this.answers.filter((known) => known !== answer)
    if (this.answers.length === 0) this.setSpeaking(false)
  }

  private remember(sentence: string): void {
    this.recent = [...this.recent, sentence].slice(-ECHO_SENTENCES)
  }

  private setSpeaking(speaking: boolean): void {
    if (this.speaking === speaking) return

    this.speaking = speaking
    this.options.onSpeaking(speaking)
  }
}

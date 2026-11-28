import type { VoiceLanguage } from '@shared/voice'

import { speakableLines } from '../speech/speakable'
import { textLanguage } from '../speech/text-language'
import type { CallMouth } from './call-mouth'
import type { Utterance } from './utterances'
import { phrasesOf } from './voice-phrases'

/**
 * Фраза звонка показа о молчании на вопрос (ADR 0135): идём дальше, повторяю вопрос, заканчиваю.
 */
export type ShowCue = { kind: 'goOn' } | { kind: 'askAgain'; question: string } | { kind: 'giveUp' }

/**
 * Что показ забирает у реплик человека: реплику, пока агент ждёт его ответа или шага (ask,
 * wait_for_user), - сказанное тогда ответ ожидания, а не новое сообщение в чат (забрал - true); и
 * сколько пометок он нарисовал к реплике (забирает их - следующей реплике они не новость).
 */
export type ShowHooks = { intercept: (utterance: Utterance) => boolean; drawn: () => number }

/** Фраза во рту и прозвучит ли она: true - дослушана, false - оборвана или звонок не слышен. */
export type Spoken = { spoken: Promise<boolean> }

export type CallShowOptions = {
  /** Рот звонка сейчас: после паузы он новый. */
  mouth: () => Pick<CallMouth, 'say' | 'drained' | 'isSpeaking'>
  /** Язык ответа сейчас: последней реплики или выбранный. */
  language: () => VoiceLanguage
  /** Звонок слышен: не на паузе и не кончился. Иначе фраза пропала бы в пустоту. */
  isLive: () => boolean
  /** Человек сейчас говорит: живой текст реплики не пуст. */
  hearing: () => boolean
  /** Ожидание человека началось или кончилось: состояние звонка поменялось. */
  onChange: () => void
  /**
   * Лента показала идущий инструмент - текст модели перед ним уже во рту (CallBrain.toolStarted),
   * - или прошло limitMs.
   */
  toolStarted: (limitMs: number) => Promise<void>
}

/**
 * Сколько такт показа ждёт, пока лента покажет идущий инструмент (ADR 0134): вызов через шлюз
 * может обогнать ленту, но не на столько.
 */
const TOOL_IN_FEED_MS = 400

const NOT_SPOKEN: Spoken = { spoken: Promise.resolve(false) }

/**
 * Голос показа Walkthrough внутри звонка (ADR 0135). Фразы, которые модель отдаёт инструментом
 * (подсветка и её пояснение, вопрос), звучат своим ходом голоса: вопрос отдельным ходом синтез
 * произносит с вопросительной интонацией (замер 2026-11-26), а очередь показа узнаёт, когда фраза
 * прозвучала. Ещё - отклик на реплику человека, пока модель думает, и фразы о молчании.
 */
export class CallShow {
  private waiting = false
  private said = 0
  private acks = 0

  constructor(private readonly options: CallShowOptions) {}

  /** Показ ждёт ответа или шага человека. */
  get listening(): boolean {
    return this.waiting
  }

  /**
   * Показ ждёт ответа или шага человека: агент работает инструментом, но для ушей он не занят -
   * короткое «да» тогда ответ, а не поддакивание, - и тихий сигнал «я ещё тут» молчит.
   */
  listen(on: boolean): void {
    if (this.waiting === on) return

    this.waiting = on
    this.options.onChange()
  }

  /** Человек сейчас говорит: тишину на вопрос показ считает без этого времени. */
  hearing(): boolean {
    return this.options.hearing()
  }

  /** Начало показа: IDE спрашивает сама - человек нажал кнопку и ещё не сказал, что показать. */
  hello(): void {
    const language = this.options.language()

    this.speak('walkthrough-hello', phrasesOf(language).walkthroughHello, language)
  }

  /**
   * Такт показа (ADR 0134): прозвучит ли всё, что модель сказала до этой минуты. Сначала лента
   * должна показать идущий инструмент - тогда текст перед ним уже во рту, - потом рот запоминает,
   * что держит, и spoken сбывается, когда это дослушано (true) или оборвано (false). Обёртка, а не
   * голое обещание: вызывающий ждёт только снятия мерки, а не самого голоса.
   */
  async speechSoFar(): Promise<Spoken> {
    if (this.options.isLive()) await this.options.toolStarted(TOOL_IN_FEED_MS)

    return this.options.isLive() ? { spoken: this.options.mouth().drained() } : NOT_SPOKEN
  }

  /** Фраза модели своим ходом голоса: голос - по языку её текста, как у ответа (ADR 0106). */
  say(text: string): Spoken {
    const language = textLanguage(speakableLines(text).join(' '), this.options.language())

    return this.speak(`walkthrough-say:${(this.said += 1)}`, text, language)
  }

  /** Фраза звонка о молчании человека - на языке разговора. */
  cue(cue: ShowCue): Spoken {
    const language = this.options.language()
    const phrases = phrasesOf(language)
    const text =
      cue.kind === 'goOn'
        ? phrases.goOn
        : cue.kind === 'giveUp'
          ? phrases.giveUp
          : phrases.askAgain(cue.question)

    return this.speak(`walkthrough-say:${(this.said += 1)}`, text, language)
  }

  /**
   * Человек договорил реплику: отозваться сразу, а не молчать, пока модель думает (до её первых
   * слов проходят секунды). Рот ещё говорит - реплика его не оборвала, и отклик встал бы в хвост.
   */
  acknowledge(language: VoiceLanguage): void {
    if (!this.options.isLive() || this.options.mouth().isSpeaking) return

    const { heard } = phrasesOf(language)
    const text = heard[this.acks % heard.length] ?? ''

    this.acks += 1
    this.speak(`walkthrough-heard:${this.acks}`, text, language)
  }

  private speak(id: string, text: string, language: VoiceLanguage): Spoken {
    if (!this.options.isLive()) return NOT_SPOKEN

    const mouth = this.options.mouth()

    mouth.say(id, text, language)

    return { spoken: mouth.drained(id) }
  }
}

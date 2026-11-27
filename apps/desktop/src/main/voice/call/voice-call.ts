import type { Conversation } from '@shared/conversation'
import type { FeedItem, FeedPatch } from '@shared/conversation-feed'
import type {
  VoiceCallEnd,
  VoiceCallView,
  VoiceKeyCheck,
  VoiceLanguage,
  VoiceSettings,
  VoiceCallState,
} from '@shared/voice'

import type { DeepgramDial } from '../deepgram/deepgram-link'
import type { ListenTrouble } from '../deepgram/flux-listen'
import { DUCK_LEVEL } from './barge-in'
import { CallAlarms } from './call-alarms'
import type { AgentWork, CallAgent } from './call-brain'
import { CallBrain } from './call-brain'
import type { BargeIn } from './call-ears'
import { CallEars } from './call-ears'
import type { SpokenAnswer } from './call-mouth'
import { CallMouth } from './call-mouth'
import type { Timer, Utterance } from './utterances'
import type { VoiceEndpoint } from './voice-endpoint'
import { phrasesOf } from './voice-phrases'
import { isStopOnly } from './voice-words'

/** После стольких минут тишины звонок спрашивает «ты ещё тут?» (spec, «Долго никто не говорит»). */
export const SILENCE_MS = 10 * 60_000
/** Столько ждать ответа на «ты ещё тут?», потом положить трубку. */
const GOODBYE_MS = 60_000
/** Агент работает молча дольше этого - тихий сигнал «я ещё тут», и так же дальше. */
const STILL_HERE_MS = 15_000
/** Связь с телефоном потеряна - сессия ждёт его столько (spec: 60 с). */
export const LINE_LOST_MS = 60_000
/**
 * Сколько такт показа ждёт, пока лента покажет идущий инструмент (ADR 0134): вызов через шлюз
 * может обогнать ленту, но не на столько.
 */
const TOOL_IN_FEED_MS = 400

export type VoiceCallOptions = {
  id: string
  conversationId: string
  view: Pick<VoiceCallView, 'provider' | 'origin' | 'startedAt' | 'mode'>
  settings: VoiceSettings
  key: string
  dial: DeepgramDial
  timer: Timer
  now: () => number
  endpoint: VoiceEndpoint
  agent: CallAgent
  checkKey: () => Promise<VoiceKeyCheck>
  onView: (view: VoiceCallView) => void
  onEnded: (reason: VoiceCallEnd) => void
  /** Ответ прозвучал целиком: его звук - в запас «Прочитать вслух» (ADR 0106). */
  onSpoken?: ((spoken: SpokenAnswer) => void) | undefined
  /**
   * Реплика человека, которую забирает показ (ADR 0134): агент ждёт его действия (wait_for_user),
   * и сказанное - ответ этого ожидания, а не новое сообщение в чат. Забрал - true.
   */
  intercept?: ((utterance: Utterance) => boolean) | undefined
}

/**
 * Звонок (ADR 0104): уши (Flux STT), рот (Flux TTS) и мозг (разговор панели) вокруг одной
 * конечной точки. Состояние звонка выводится из них: пауза, переподключение, говорю,
 * выполняю, думаю, слушаю. Пауза (телефон заблокирован) закрывает Deepgram - минуты не идут,
 * разговор не трогается; возобновление открывает его заново.
 */
export class VoiceCall {
  private ears: CallEars
  private mouth: CallMouth
  private readonly brain: CallBrain
  private work: AgentWork = { state: 'idle', tool: null }
  private heard = ''
  private muted = false
  private paused = false
  private troubled = false
  private ended = false
  private language: VoiceLanguage | null
  /** Настройки звонка: скорость и перебивание меняются на лету, остальное - с ним же до конца. */
  private settings: VoiceSettings
  private readonly alarms: CallAlarms

  constructor(private readonly options: VoiceCallOptions) {
    const { languageMode } = options.settings

    this.settings = options.settings
    this.alarms = new CallAlarms(options.timer)
    this.language = languageMode === 'multi' ? null : languageMode
    this.mouth = this.newMouth()
    this.ears = this.newEars()
    this.brain = new CallBrain({
      agent: options.agent,
      mouth: () => this.mouth,
      language: () => this.replyLanguage,
      onWork: (work) => {
        this.work = work
        this.changed()
      },
      walkthrough: options.view.mode === 'walkthrough',
    })
  }

  get view(): VoiceCallView {
    const { id, conversationId, view } = this.options

    return {
      id,
      conversationId,
      ...view,
      state: this.state,
      tool: this.work.tool,
      heard: this.heard,
      muted: this.muted,
      language: this.language,
      agentBusy: this.work.state !== 'idle',
    }
  }

  get conversationId(): string {
    return this.options.conversationId
  }

  get mode(): VoiceCallView['mode'] {
    return this.options.view.mode
  }

  start(items: readonly FeedItem[]): void {
    this.options.agent.notice('voice-started', this.options.view.origin)
    this.brain.seed(items)
    this.ears.start()

    const language = this.replyLanguage

    // Показ начинает IDE сама: человек нажал кнопку и ещё не сказал, что показать.
    if (this.mode === 'walkthrough') {
      this.mouth.say('walkthrough-hello', phrasesOf(language).walkthroughHello, language)
    } else {
      this.mouth.warm(language)
    }

    this.watchSilence()
    this.changed()
  }

  /**
   * Такт показа (ADR 0134): прозвучит ли всё, что модель сказала до этой минуты. Сначала лента
   * должна показать идущий инструмент - тогда текст перед ним уже во рту, - потом рот запоминает,
   * что держит, и spoken сбывается, когда это дослушано (true) или оборвано (false). Обёртка, а не
   * голое обещание: вызывающий ждёт только снятия мерки, а не самого голоса.
   */
  async speechSoFar(): Promise<{ spoken: Promise<boolean> }> {
    if (!this.ended) await this.brain.toolStarted(TOOL_IN_FEED_MS, this.options.timer)

    return { spoken: this.ended ? Promise.resolve(false) : this.mouth.drained() }
  }

  mic(pcm: Uint8Array): void {
    if (!this.paused && !this.ended) this.ears.mic(pcm)
  }

  played(epoch: number, ms: number): void {
    this.mouth.played(epoch, ms)
  }

  feed(patch: FeedPatch): void {
    if (patch.conversationId === this.conversationId) this.brain.feed(patch)
  }

  conversation(conversation: Conversation | null): void {
    if (!conversation) this.end('conversationGone')
    else this.brain.state(conversation)
  }

  /** Настройки поменяли посреди звонка: скорость речи и перебивание - сразу. */
  applySettings(settings: VoiceSettings): void {
    this.settings = {
      ...this.settings,
      speed: settings.speed,
      bargeIn: settings.bargeIn,
      stillHere: settings.stillHere,
    }
    this.mouth.setSpeed(settings.speed)
    this.ears.setBargeIn(settings.bargeIn)
  }

  /**
   * Кнопка «Стоп»: замолчать (и ответ, у которого звука ещё нет) и остановить работу агента.
   * Новая эпоха - всегда: конечная точка могла ещё играть то, что рот уже считает прозвучавшим.
   */
  stop(): void {
    this.mouth.cut(true)
    if (this.work.state !== 'idle') this.brain.interrupt()
  }

  mute(on: boolean): void {
    this.muted = on
    this.changed()
  }

  pause(): void {
    if (this.paused || this.ended) return

    this.paused = true
    // Deepgram закрыт, пока звонок на паузе; что агент скажет за это время, мозг копит.
    this.brain.hold()
    this.mouth.stop()
    this.ears.stop()
    this.troubled = false
    this.changed()
  }

  resume(): void {
    if (!this.paused || this.ended) return

    this.paused = false
    // Новый рот - с новой эпохи: проигрыватель конечной точки мог уйти вперёд после перебивания,
    // и кадры прежней эпохи он бы выкинул.
    const epoch = this.mouth.currentEpoch + 1

    this.mouth = this.newMouth(epoch)
    this.options.endpoint.cue({ kind: 'stopPlayback', epoch })
    this.ears = this.newEars()
    this.ears.start()
    this.mouth.warm(this.replyLanguage)
    this.brain.release()
    this.changed()
  }

  /** Связь с конечной точкой пропала: ждать её 60 с, потом положить трубку. */
  lineLost(): void {
    this.alarms.arm('line', () => this.end('lostLine'), LINE_LOST_MS)
  }

  lineBack(): void {
    this.alarms.disarm('line')
  }

  end(reason: VoiceCallEnd): void {
    if (this.ended) return

    this.ended = true

    // Разговор закрыли - ждавшие реплики идти некуда. Иначе - уходят в его очередь.
    const keep = reason !== 'conversationGone'

    try {
      if (keep) this.ears.flush()
      if (keep) this.brain.flush()
      if (keep) this.options.agent.notice('voice-ended', reason)
    } catch (error) {
      console.warn('Voice: the call could not leave its last words', error)
    } finally {
      this.ears.stop()
      this.mouth.stop()

      this.alarms.clear()
      this.options.endpoint.cue({ kind: 'ended', reason, conversationId: this.conversationId })
      this.options.onEnded(reason)
    }
  }

  private get replyLanguage(): VoiceLanguage {
    return this.ears.lastLanguage ?? this.language ?? this.settings.expected[0] ?? 'en'
  }

  private get state(): VoiceCallState {
    if (this.paused) return 'paused'
    if (this.troubled) return 'reconnecting'
    if (this.mouth.isSpeaking) return 'speaking'
    if (this.work.state !== 'idle') return this.work.state

    return 'listening'
  }

  private newMouth(epoch = 0): CallMouth {
    const { key, dial, timer, endpoint } = this.options
    const { settings } = this

    return new CallMouth({
      epoch,
      key,
      region: settings.region,
      speed: settings.speed,
      voices: settings.voices,
      dial,
      timer,
      endpoint,
      onSpeaking: () => this.changed(),
      onCut: (_, spoken) => this.brain.cut(spoken),
      onSpoken: this.options.onSpoken,
    })
  }

  private newEars(): CallEars {
    const { key, dial, timer, now } = this.options
    const { settings } = this

    return new CallEars({
      key,
      region: settings.region,
      mode: settings.languageMode,
      hints: settings.expected,
      bargeIn: settings.bargeIn,
      dial,
      timer,
      now,
      isSpeaking: () => this.mouth.isSpeaking,
      recentlySaid: () => this.mouth.recentlySaid,
      isAgentBusy: () => this.brain.isBusy,
      onHeard: (text) => {
        this.heard = text
        if (text) this.watchSilence()
        this.changed()
      },
      onUtterance: (utterance) => {
        this.language = utterance.language
        // «Стоп» и сейчас останавливает работу; остальное может быть ответом ожидания показа.
        if (!isStopOnly(utterance.text) && this.options.intercept?.(utterance)) return
        this.brain.utterance(utterance)
      },
      onBargeIn: (action) => this.bargeIn(action),
      onStopWord: () => this.brain.halt(),
      onTrouble: (trouble) => void this.trouble(trouble),
    })
  }

  private bargeIn(action: BargeIn): void {
    if (action === 'stop') this.mouth.cut()
    else this.options.endpoint.cue({ kind: 'duck', level: action === 'duck' ? DUCK_LEVEL : 1 })
  }

  private async trouble(trouble: ListenTrouble): Promise<void> {
    if (trouble !== 'failed') {
      this.troubled = trouble === 'reconnecting'
      this.changed()

      return
    }

    const check = await this.options.checkKey()

    this.end(check === 'invalid' ? 'keyRejected' : 'deepgram')
  }

  /** Тишина: агент свободен и человек молчит 10 минут - спросить, потом положить трубку. */
  private watchSilence(): void {
    this.alarms.disarm('goodbye')
    this.alarms.arm(
      'silence',
      () => {
        if (this.work.state !== 'idle' || this.paused) return this.watchSilence()

        const language = this.replyLanguage

        this.mouth.say(`still-there:${Date.now()}`, phrasesOf(language).stillThere, language)
        this.alarms.arm('goodbye', () => this.end('silence'), GOODBYE_MS)
      },
      SILENCE_MS,
    )
  }

  /** Тихий сигнал, пока агент работает молча; заговорил или освободился - сигнал не нужен. */
  private watchWork(): void {
    const silentWork = this.state === 'working' || this.state === 'thinking'

    if (!silentWork || !this.settings.stillHere) {
      this.alarms.disarm('tone')

      return
    }

    if (this.alarms.has('tone')) return

    this.alarms.arm(
      'tone',
      () => {
        this.options.endpoint.cue({ kind: 'tone' })
        this.watchWork()
      },
      STILL_HERE_MS,
    )
  }

  private changed(): void {
    if (this.ended) return

    this.watchWork()
    this.options.endpoint.cue({ kind: 'state', call: this.view })
    this.options.onView(this.view)
  }
}

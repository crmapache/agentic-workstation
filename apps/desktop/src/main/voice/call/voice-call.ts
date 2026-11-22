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
import type { AgentWork, CallAgent } from './call-brain'
import { CallBrain } from './call-brain'
import type { BargeIn } from './call-ears'
import { CallEars } from './call-ears'
import { CallMouth } from './call-mouth'
import type { Timer } from './utterances'
import type { VoiceEndpoint } from './voice-endpoint'
import { phrasesOf } from './voice-phrases'

/** После стольких минут тишины звонок спрашивает «ты ещё тут?» (spec, «Долго никто не говорит»). */
export const SILENCE_MS = 10 * 60_000
/** Столько ждать ответа на «ты ещё тут?», потом положить трубку. */
const GOODBYE_MS = 60_000
/** Агент работает молча дольше этого - тихий сигнал «я ещё тут», и так же дальше. */
const STILL_HERE_MS = 15_000
/** Связь с телефоном потеряна - сессия ждёт его столько (spec: 60 с). */
export const LINE_LOST_MS = 60_000

export type VoiceCallOptions = {
  id: string
  conversationId: string
  view: Pick<VoiceCallView, 'provider' | 'origin' | 'startedAt'>
  settings: VoiceSettings
  key: string
  dial: DeepgramDial
  timer: Timer
  endpoint: VoiceEndpoint
  agent: CallAgent
  checkKey: () => Promise<VoiceKeyCheck>
  onView: (view: VoiceCallView) => void
  onEnded: (reason: VoiceCallEnd) => void
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
  private readonly cancels = new Map<'silence' | 'goodbye' | 'tone' | 'line', () => void>()

  constructor(private readonly options: VoiceCallOptions) {
    const { languageMode } = options.settings

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
    }
  }

  get conversationId(): string {
    return this.options.conversationId
  }

  start(items: readonly FeedItem[]): void {
    this.options.agent.notice('voice-started', this.options.view.origin)
    this.brain.seed(items)
    this.ears.start()
    this.mouth.warm(this.replyLanguage)
    this.watchSilence()
    this.changed()
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

  /** Кнопка «Стоп»: замолчать и остановить работу агента. */
  stop(): void {
    if (this.mouth.isSpeaking) this.mouth.cut()
    if (this.work.state !== 'idle') this.options.agent.interrupt()
  }

  mute(on: boolean): void {
    this.muted = on
    this.changed()
  }

  pause(): void {
    if (this.paused || this.ended) return

    this.paused = true
    this.mouth.stop()
    this.ears.stop()
    this.changed()
  }

  resume(): void {
    if (!this.paused || this.ended) return

    this.paused = false
    this.mouth = this.newMouth()
    this.ears = this.newEars()
    this.ears.start()
    this.mouth.warm(this.replyLanguage)
    this.changed()
  }

  /** Связь с конечной точкой пропала: ждать её 60 с, потом положить трубку. */
  lineLost(): void {
    this.arm('line', () => this.end('lostLine'), LINE_LOST_MS)
  }

  lineBack(): void {
    this.disarm('line')
  }

  end(reason: VoiceCallEnd): void {
    if (this.ended) return

    this.ended = true
    this.ears.flush()
    this.brain.flush()
    this.ears.stop()
    this.mouth.stop()
    if (reason !== 'conversationGone') this.options.agent.notice('voice-ended', reason)

    for (const cancel of this.cancels.values()) cancel()

    this.cancels.clear()
    this.options.endpoint.cue({ kind: 'ended', reason, conversationId: this.conversationId })
    this.options.onEnded(reason)
  }

  private get replyLanguage(): VoiceLanguage {
    return this.ears.lastLanguage ?? this.language ?? this.options.settings.expected[0] ?? 'en'
  }

  private get state(): VoiceCallState {
    if (this.paused) return 'paused'
    if (this.troubled) return 'reconnecting'
    if (this.mouth.isSpeaking) return 'speaking'
    if (this.work.state !== 'idle') return this.work.state

    return 'listening'
  }

  private newMouth(): CallMouth {
    const { key, settings, dial, timer, endpoint } = this.options

    return new CallMouth({
      key,
      region: settings.region,
      speed: settings.speed,
      voices: settings.voices,
      dial,
      timer,
      endpoint,
      onSpeaking: () => this.changed(),
      onCut: (_, spoken) => this.brain.cut(spoken),
    })
  }

  private newEars(): CallEars {
    const { key, settings, dial, timer } = this.options

    return new CallEars({
      key,
      region: settings.region,
      mode: settings.languageMode,
      hints: settings.expected,
      bargeIn: settings.bargeIn,
      dial,
      timer,
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
        this.brain.utterance(utterance)
      },
      onBargeIn: (action) => this.bargeIn(action),
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
    this.disarm('goodbye')
    this.arm(
      'silence',
      () => {
        if (this.work.state !== 'idle' || this.paused) return this.watchSilence()

        const language = this.replyLanguage

        this.mouth.say(`still-there:${Date.now()}`, phrasesOf(language).stillThere, language)
        this.arm('goodbye', () => this.end('silence'), GOODBYE_MS)
      },
      SILENCE_MS,
    )
  }

  /** Тихий сигнал, пока агент работает молча; заговорил или освободился - сигнал не нужен. */
  private watchWork(): void {
    const silentWork = this.state === 'working' || this.state === 'thinking'

    if (!silentWork || !this.options.settings.stillHere) {
      this.disarm('tone')

      return
    }

    if (this.cancels.has('tone')) return

    this.arm(
      'tone',
      () => {
        this.cancels.delete('tone')
        this.options.endpoint.cue({ kind: 'tone' })
        this.watchWork()
      },
      STILL_HERE_MS,
    )
  }

  private arm(name: 'silence' | 'goodbye' | 'tone' | 'line', run: () => void, ms: number): void {
    this.disarm(name)
    this.cancels.set(name, this.options.timer(run, ms))
  }

  private disarm(name: 'silence' | 'goodbye' | 'tone' | 'line'): void {
    this.cancels.get(name)?.()
    this.cancels.delete(name)
  }

  private changed(): void {
    if (this.ended) return

    this.watchWork()
    this.options.endpoint.cue({ kind: 'state', call: this.view })
    this.options.onView(this.view)
  }
}

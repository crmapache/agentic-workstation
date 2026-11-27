import type { Conversation, PendingRequest } from '@shared/conversation'
import type { FeedItem, FeedPatch } from '@shared/conversation-feed'
import type { VoiceLanguage, VoiceOutgoing } from '@shared/voice'

import type { CallMouth } from './call-mouth'
import type { Utterance } from './utterances'
import { phrasesOf } from './voice-phrases'
import { isStopOnly, hasStopWord } from './voice-words'

/** Чем занят агент: свободен, думает (или пишет ответ), выполняет инструмент. */
export type AgentWork = { state: 'idle' | 'thinking' | 'working'; tool: string | null }

/** Разговор звонка - теми же публичными действиями, что у телефона (ConversationsPort). */
export type CallAgent = {
  send: (text: string, voice: VoiceOutgoing) => Promise<unknown>
  interrupt: () => unknown
  /** Отметка звонка в ленте: начался, кончился, что человек услышал из перебитого ответа. */
  notice: (code: 'voice-started' | 'voice-ended' | 'voice-heard', detail: string) => void
}

export type CallBrainOptions = {
  agent: CallAgent
  /** Рот звонка сейчас: после паузы он новый. */
  mouth: () => Pick<CallMouth, 'answer' | 'say' | 'isSpeaking' | 'cut'>
  /** Язык ответа сейчас: последней реплики или выбранный. */
  language: () => VoiceLanguage
  onWork: (work: AgentWork) => void
  /** Звонок - показ Walkthrough (ADR 0134): реплики уходят с его пометкой. */
  walkthrough?: boolean | undefined
}

/** Что звонок скажет о вопросе к человеку; нечего - null. */
const announce = (pending: PendingRequest, language: VoiceLanguage): string => {
  const phrases = phrasesOf(language)

  switch (pending.kind) {
    case 'permission':
      return phrases.permission(pending.description || pending.toolName)
    case 'question':
      return phrases.question(pending.questions[0]?.question ?? '')
    case 'plan':
      return phrases.plan
  }
}

/**
 * Мозг звонка: реплики - в разговор, ответ разговора - во рту. Реплика, пока агент пишет ответ
 * или говорит, останавливает его и уходит после конца хода (spec, «Новая реплика во время
 * работы агента»); посреди инструмента - уходит сразу, модель прочтёт её на следующем шаге;
 * «стоп» и «отмена» останавливают работу сразу. Вопрос агента к человеку звонок произносит.
 */
export class CallBrain {
  private readonly known = new Set<string>()
  private status: Conversation['status'] = 'idle'
  private pendingId: string | null = null
  private tool: string | null = null
  private writing = false
  private waiting: Utterance[] = []
  private heard: string | null = null
  /** Звонок на паузе: ответы и вопросы копятся и звучат после возврата, а не в пустоту. */
  private holding = false
  private readonly held = new Map<string, { text: string; streaming: boolean }>()
  /** Кто ждёт, пока лента покажет идущий инструмент (toolStarted). */
  private toolWaiters: (() => void)[] = []

  constructor(private readonly options: CallBrainOptions) {}

  /** Пауза: всё, что агент скажет, - копить. */
  hold(): void {
    this.holding = true
  }

  /** Возврат: накопленное за паузу - новому рту, по порядку. */
  release(): void {
    this.holding = false

    const language = this.options.language()

    for (const [id, { text, streaming }] of this.held) {
      this.options.mouth().answer(id, text, streaming, language)
    }

    this.held.clear()
  }

  /** Агент говорит, пишет или работает: поддакивание тогда не реплика. */
  get isBusy(): boolean {
    return this.status !== 'idle' || this.options.mouth().isSpeaking
  }

  /** Что было в ленте до звонка - не озвучивается. */
  seed(items: readonly FeedItem[]): void {
    for (const item of items) this.known.add(item.id)
  }

  feed(patch: FeedPatch): void {
    for (const item of patch.upserts) {
      if (item.parentToolUseId !== null || this.known.has(item.id)) continue

      if (item.kind === 'assistant') {
        this.writing = item.streaming
        this.speak(item.id, item.text, item.streaming)
      } else if (item.kind === 'tool') {
        this.tool = item.status === 'running' ? item.name : null
      }
    }

    if (this.tool) this.wakeToolWaiters()
    this.report()
  }

  /**
   * Лента показала идущий инструмент - значит, текст модели перед ним уже дошёл до рта (ADR 0134):
   * вызов инструмента приходит в IDE своим путём (шлюз коннекторов) и может обогнать ленту. Ждать
   * не дольше limitMs: у провайдера, который показывает вызов только законченным, ждать нечего.
   */
  toolStarted(limitMs: number, timer: (run: () => void, ms: number) => () => void): Promise<void> {
    if (this.tool) return Promise.resolve()

    return new Promise((resolve) => {
      let cancel = (): void => undefined
      const done = () => {
        cancel()
        this.toolWaiters = this.toolWaiters.filter((waiter) => waiter !== done)
        resolve()
      }

      this.toolWaiters.push(done)
      cancel = timer(done, limitMs)
    })
  }

  state(conversation: Conversation): void {
    this.status = conversation.status

    const { pending } = conversation

    if (pending && pending.requestId !== this.pendingId) {
      this.speak(`pending:${pending.requestId}`, announce(pending, this.options.language()), false)
    }

    this.pendingId = pending?.requestId ?? null

    if (this.status === 'idle') {
      this.tool = null
      this.writing = false
      this.sendWaiting()
    }

    this.report()
  }

  utterance(utterance: Utterance): void {
    const running = this.status === 'running'
    const stops = hasStopWord(utterance.text)

    // «Стоп» глушит и ответ, у которого звука ещё нет: иначе он дозвучал бы после остановки.
    if (stops) this.options.mouth().cut()

    if (running && (stops || this.writing || this.options.mouth().isSpeaking)) {
      this.interrupt()
      if (!isStopOnly(utterance.text)) this.waiting.push(utterance)

      return
    }

    if (isStopOnly(utterance.text) && this.status === 'idle') return

    void this.send([utterance])
  }

  /**
   * Человек сказал «стоп» посреди реплики: замолчать и остановить работу сразу. Сама реплика
   * придёт после паузы (UtteranceDesk) и уйдёт в чат обычным путём.
   */
  halt(): void {
    this.options.mouth().cut()
    if (this.status === 'running') this.interrupt()
  }

  /** Ответ оборван: что человек успел услышать - модели со следующей репликой. */
  cut(spoken: string): void {
    this.heard = spoken
    if (spoken.trim()) this.options.agent.notice('voice-heard', spoken.trim())
  }

  /** Звонок кончается: реплики, ждавшие конца хода, уходят в очередь разговора. */
  flush(): void {
    this.sendWaiting()
  }

  /** Остановить ход агента; разговора уже нет - не беда, звонок своё доделает. */
  interrupt(): void {
    try {
      this.options.agent.interrupt()
    } catch (error) {
      console.warn('Voice: the conversation could not be stopped', error)
    }
  }

  private speak(id: string, text: string, streaming: boolean): void {
    if (this.holding) this.held.set(id, { text, streaming })
    else this.options.mouth().answer(id, text, streaming, this.options.language())
  }

  private wakeToolWaiters(): void {
    const waiters = this.toolWaiters

    this.toolWaiters = []

    for (const waiter of waiters) waiter()
  }

  private sendWaiting(): void {
    if (this.waiting.length === 0) return

    const waiting = this.waiting

    this.waiting = []
    void this.send(waiting)
  }

  private async send(utterances: Utterance[]): Promise<void> {
    const last = utterances.at(-1)

    if (!last) return

    const text = utterances.map((utterance) => utterance.text).join(' ')
    const heard = this.heard

    this.heard = null
    const voice = {
      lang: last.language,
      heard,
      ...(this.options.walkthrough ? { walkthrough: true } : {}),
    }

    await this.options.agent.send(text, voice).catch((error: unknown) => {
      console.warn('Voice: the line did not reach the conversation', error)
    })
  }

  private report(): void {
    const state = this.status === 'idle' ? 'idle' : this.tool ? 'working' : 'thinking'

    this.options.onWork({ state, tool: state === 'working' ? this.tool : null })
  }
}

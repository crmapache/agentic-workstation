import type { Conversation, PendingRequest } from '@shared/conversation'
import type { FeedItem, FeedPatch } from '@shared/conversation-feed'
import type { VoiceLanguage, VoiceOutgoing } from '@shared/voice'

import type { CallMouth } from './call-mouth'
import type { Utterance } from './utterances'
import { phrasesOf } from './voice-phrases'
import { hasStopWord, wordsOf } from './voice-words'

/** Чем занят агент: свободен, думает (или пишет ответ), выполняет инструмент. */
export type AgentWork = { state: 'idle' | 'thinking' | 'working'; tool: string | null }

/** Разговор звонка - теми же публичными действиями, что у телефона (ConversationsPort). */
export type CallAgent = {
  send: (text: string, voice: VoiceOutgoing) => Promise<unknown>
  interrupt: () => unknown
}

export type CallBrainOptions = {
  agent: CallAgent
  /** Рот звонка сейчас: после паузы он новый. */
  mouth: () => Pick<CallMouth, 'answer' | 'say' | 'isSpeaking'>
  /** Язык ответа сейчас: последней реплики или выбранный. */
  language: () => VoiceLanguage
  onWork: (work: AgentWork) => void
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

/** Реплика - одни слова остановки («стоп», «подожди»): её дело - остановить, а не уйти в чат. */
const onlyStops = (text: string): boolean =>
  hasStopWord(text) && wordsOf(text).length <= 2

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

  constructor(private readonly options: CallBrainOptions) {}

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
        this.options.mouth().answer(item.id, item.text, item.streaming, this.options.language())
      } else if (item.kind === 'tool') {
        this.tool = item.status === 'running' ? item.name : null
      }
    }

    this.report()
  }

  state(conversation: Conversation): void {
    this.status = conversation.status

    const { pending } = conversation

    if (pending && pending.requestId !== this.pendingId) {
      const language = this.options.language()

      this.options.mouth().say(`pending:${pending.requestId}`, announce(pending, language), language)
    }

    this.pendingId = pending?.requestId ?? null

    if (this.status === 'idle') {
      this.tool = null
      this.writing = false
      this.release()
    }

    this.report()
  }

  utterance(utterance: Utterance): void {
    const running = this.status === 'running'

    if (running && (hasStopWord(utterance.text) || this.writing || this.options.mouth().isSpeaking)) {
      this.options.agent.interrupt()
      if (!onlyStops(utterance.text)) this.waiting.push(utterance)

      return
    }

    if (onlyStops(utterance.text) && this.status === 'idle') return

    void this.send([utterance])
  }

  /** Ответ оборван: что человек успел услышать - модели со следующей репликой. */
  cut(spoken: string): void {
    this.heard = spoken
  }

  /** Звонок кончается: реплики, ждавшие конца хода, уходят в очередь разговора. */
  flush(): void {
    this.release()
  }

  private release(): void {
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
    await this.options.agent.send(text, { lang: last.language, heard }).catch((error: unknown) => {
      console.warn('Voice: the line did not reach the conversation', error)
    })
  }

  private report(): void {
    const state = this.status === 'idle' ? 'idle' : this.tool ? 'working' : 'thinking'

    this.options.onWork({ state, tool: state === 'working' ? this.tool : null })
  }
}

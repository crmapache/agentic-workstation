import { randomUUID } from 'node:crypto'

import type { FeedPatch, ConversationFeed } from '@shared/claude-feed'
import type { AiJob, GenerateConnectorRequest } from '@shared/connector-spec'
import type { ImportCandidate } from '@shared/connectors'

import type { JsonFile } from '../../storage/json-file'
import { readAnswer, ANSWER_JSON_SCHEMA } from './ai-answer'
import type { AiChat, OpenAiChat, AiChatTurnEnd } from './ai-chat'
import { STOP_GRACE_MS, TURN_TIMEOUT_MS } from './ai-connector.constants'
import type { StoredAiJobs } from './ai-jobs-file'
import { storedJob, parseStoredAiJobs } from './ai-jobs-file'
import { firstMessage, aiInstructions } from './ai-prompt'

export type AiDeskHost = {
  open: OpenAiChat
  file: JsonFile<StoredAiJobs>
  /** Серверы из конфига Claude Code: ИИ узнаёт по ним то, что у человека уже настроено. */
  candidates: () => Promise<ImportCandidate[]>
  changed: () => void
  onFeed: (jobId: string, patch: FeedPatch) => void
}

/** Работа и всё, что к ней приложено в памяти: разговор, его сервер-список, часы хода. */
type LiveJob = {
  job: AiJob
  sessionId: string
  saved: boolean
  /** Разговор открывается один раз; null внутри - работу убрали, пока он открывался. */
  chat: Promise<{ chat: AiChat; candidates: ImportCandidate[] } | null> | null
  timer: NodeJS.Timeout | null
  timedOut: boolean
}

/**
 * Работы ИИ над новыми коннекторами (ADR 0050): очередь разговоров, которые идут параллельно и
 * живут здесь, а не в окне. Ход работы - событиями, лента разговора - патчами; окно открывает
 * любую работу и пишет ИИ посреди хода. Готовое, начатое и остановленное переживает перезапуск
 * IDE: разговор продолжится с диска.
 */
export class AiConnectorDesk {
  private readonly jobs = new Map<string, LiveJob>()
  private saving: Promise<void> = Promise.resolve()

  constructor(private readonly host: AiDeskHost) {}

  /** Работы с диска - при старте IDE, до первого окна. Начатые до чтения не затираются. */
  async load(): Promise<void> {
    for (const { sessionId, saved, ...job } of parseStoredAiJobs(await this.host.file.read())) {
      if (this.jobs.has(job.id)) continue

      this.jobs.set(job.id, {
        job: { ...job, activity: null },
        sessionId,
        saved,
        chat: null,
        timer: null,
        timedOut: false,
      })
    }

    this.host.changed()
  }

  /** Работы для окна: новые - первыми. */
  get list(): AiJob[] {
    return [...this.jobs.values()]
      .map((live) => live.job)
      .sort((left, right) => right.createdAt - left.createdAt)
  }

  /** Новая работа: сразу в очереди, первое сообщение уходит, как только поднимется разговор. */
  start(request: GenerateConnectorRequest): void {
    const id = randomUUID()
    const live: LiveJob = {
      job: {
        id,
        request,
        createdAt: Date.now(),
        status: 'working',
        activity: null,
        message: '',
        proposal: null,
        error: null,
        detail: '',
      },
      sessionId: randomUUID(),
      saved: false,
      chat: null,
      timer: null,
      timedOut: false,
    }

    this.jobs.set(id, live)
    this.say(live, firstMessage(request))
  }

  /** Слова человека: посреди хода ИИ подхватит их, после - начнёт новый ход. */
  tell(id: string, text: string): void {
    const live = this.jobs.get(id)

    if (live) this.say(live, text)
  }

  stop(id: string): void {
    void this.jobs.get(id)?.chat?.then((opened) => opened?.chat.stop())
  }

  remove(id: string): void {
    const live = this.jobs.get(id)

    if (!live) return

    this.jobs.delete(id)
    this.clearTimer(live)
    void live.chat?.then((opened) => opened?.chat.dispose())
    this.commit()
  }

  /** Лента разговора работы; прошлые ходы - с диска. Работы нет - null. */
  async feed(id: string, earlier: boolean): Promise<ConversationFeed | null> {
    const live = this.jobs.get(id)
    const opened = live ? await this.chatOf(live) : null

    return opened ? opened.chat.feed(earlier) : null
  }

  /** Выход из IDE: процессы гаснут, работы остаются на диске. */
  dispose(): void {
    for (const live of this.jobs.values()) {
      this.clearTimer(live)
      void live.chat?.then((opened) => opened?.chat.dispose())
      live.chat = null
    }
  }

  private say(live: LiveJob, text: string) {
    this.working(live)
    void this.chatOf(live).then((opened) => opened?.chat.tell(text))
  }

  /** Разговор работы: открывается при первом слове или первом взгляде на ленту. */
  private chatOf(live: LiveJob) {
    live.chat ??= this.open(live)

    return live.chat
  }

  private async open(live: LiveJob) {
    const candidates = await this.host.candidates().catch((error: unknown) => {
      console.warn('[connectors] серверы Claude Code для ИИ не прочитались', error)

      return []
    })

    // Работу убрали, пока читался конфиг: разговор ей уже не нужен.
    if (this.jobs.get(live.job.id) !== live) return null

    const { id } = live.job
    const chat = this.host.open(
      {
        sessionId: live.sessionId,
        resume: live.saved,
        instructions: aiInstructions(candidates),
        schema: ANSWER_JSON_SCHEMA,
      },
      {
        onFeed: (patch) => this.host.onFeed(id, patch),
        onTurnStarted: () => this.working(live),
        onSaved: () => {
          live.saved = true
          this.save()
        },
        onActivity: (activity) => {
          if (live.job.status !== 'working') return

          live.job = { ...live.job, activity }
          this.host.changed()
        },
        onTurnEnded: (end) => this.ended(live, end, candidates),
      },
    )

    return { chat, candidates }
  }

  /** Ход начат: работа идёт, прошлая ошибка снята, часы хода пошли. */
  private working(live: LiveJob) {
    if (live.job.status !== 'working' || !live.timer) {
      live.job = { ...live.job, status: 'working', activity: null, error: null, detail: '' }
      live.timedOut = false
      this.startTimer(live)
      this.commit()
    }
  }

  private ended(live: LiveJob, end: AiChatTurnEnd, candidates: readonly ImportCandidate[]) {
    this.clearTimer(live)

    const base = { ...live.job, activity: null, error: null, detail: '' }

    if (end.kind === 'answer') {
      const read = readAnswer(end.output, candidates)

      live.job =
        read.kind === 'proposal'
          ? { ...base, status: 'ready', message: read.message, proposal: read.proposal }
          : read.kind === 'none'
            ? { ...base, status: 'asking', message: read.message }
            : {
                ...base,
                status: 'failed',
                message: read.message,
                error: 'invalid',
                detail: read.detail,
              }
    } else if (end.kind === 'stopped') {
      live.job = live.timedOut
        ? { ...base, status: 'failed', error: 'timeout' }
        : { ...base, status: 'stopped' }
    } else {
      live.job = { ...base, status: 'failed', error: end.error, detail: end.detail }
    }

    live.timedOut = false

    if (this.jobs.get(live.job.id) === live) this.commit()
  }

  /**
   * Часы хода: ИИ читает документацию по сети, но не вечно. Срок вышел - ход останавливается;
   * процесс, который и на остановку не ответил, гасится вместе с разговором.
   */
  private startTimer(live: LiveJob) {
    this.clearTimer(live)
    live.timer = setTimeout(() => {
      live.timedOut = true
      void live.chat?.then((opened) => opened?.chat.stop())
      live.timer = setTimeout(() => this.abandon(live), STOP_GRACE_MS)
      live.timer.unref()
    }, TURN_TIMEOUT_MS)
    live.timer.unref()
  }

  private abandon(live: LiveJob) {
    const opened = live.chat

    live.chat = null
    void opened?.then((value) => value?.chat.dispose())
    this.ended(live, { kind: 'stopped' }, [])
  }

  private clearTimer(live: LiveJob) {
    if (live.timer) clearTimeout(live.timer)

    live.timer = null
  }

  /** Состояние поменялось: окну - сейчас, на диск - по очереди. */
  private commit() {
    this.save()
    this.host.changed()
  }

  private save() {
    const jobs = [...this.jobs.values()].map((live) =>
      storedJob(live.job, live.sessionId, live.saved),
    )

    this.saving = this.saving
      .then(() => this.host.file.write({ jobs }))
      .catch((error: unknown) => console.warn('[connectors] работы ИИ не записались', error))
  }
}

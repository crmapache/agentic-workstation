import type { ImageAttachment } from '@shared/conversation'
import type {
  FeedItem,
  TaskEntry,
  NoticeCode,
  StopReason,
  NoticeExtra,
  ClosedReason,
  UserFeedItem,
  ShellFeedItem,
} from '@shared/conversation-feed'

import type { AgentFeedBuilder } from '../../agents/conversation/agent-parts'
import { FeedStore } from '../../agents/feed/feed-store'
import { toolTurnChanges } from '../../agents/feed/tool-turn-changes'
import { TurnTracker } from '../../agents/feed/turn-tracker'
import { WorkClock } from '../../agents/feed/work-clock'
import { plainThought, CodexThoughts } from './codex-thoughts'
import type { CodexItem } from './codex-tools'
import { toolItemsOf } from './codex-tools'

/** Шаг плана Codex (`turn/plan/updated`) - задача списка над полем. */
export type CodexPlanStep = { step: string; status: string }

/** Чем кончился ход Codex (`turn/completed`). */
export type CodexTurnEnd = { status: string; error: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((part): part is string => typeof part === 'string') : []

const TASK_STATES: Record<string, TaskEntry['state']> = {
  pending: 'pending',
  inProgress: 'in_progress',
  completed: 'completed',
}

/**
 * Лента разговора Codex (ADR 0083): элементы потока app-server - в общие элементы ленты.
 * Ответ и размышления растут кусками, пока элемент не кончился; вызовы - из codex-tools.ts;
 * конец хода - строка хода с файлами. Что ядро делает с лентой сверх этого (остановка,
 * обрыв, часы работы), - через AgentFeedBuilder, как у Claude.
 */
export class CodexFeedBuilder implements AgentFeedBuilder {
  private readonly store = new FeedStore()
  readonly work = new WorkClock()
  private readonly turns = new TurnTracker(this.store, toolTurnChanges)
  private readonly startedAt = new Map<string, number>()
  private readonly thoughts = new CodexThoughts()
  /** Чьё следующее сжатие: человек попросил (/compact) или Codex сжал сам у края окна. */
  private compactTrigger: 'manual' | 'auto' = 'auto'
  private taskEntries: TaskEntry[] = []
  private tasksChanged = false
  private sequence = 0
  private stopReason: StopReason | null = null
  private turnStartedAt = 0

  /** idPrefix - у страницы истории: её строки хода и отметки не совпадут с живыми. */
  constructor(
    private readonly thumbnail: (image: ImageAttachment) => string = () => '',
    private readonly now: () => number = Date.now,
    private readonly idPrefix = '',
  ) {}

  get items(): readonly FeedItem[] {
    return this.store.items
  }

  get tasks(): TaskEntry[] {
    return this.taskEntries
  }

  /** Фоновой работы, переживающей ход, у Codex нет: ход кончается вместе с субагентами. */
  get hasBackgroundWork(): boolean {
    return false
  }

  get hasBackgroundCommands(): boolean {
    return false
  }

  get hasWakeup(): boolean {
    return false
  }

  addUserMessage(
    id: string,
    text: string,
    images: ImageAttachment[],
    steering: boolean,
    extra: Pick<UserFeedItem, 'draft' | 'editor' | 'auto' | 'voice'> = {},
  ): void {
    const time = this.now()

    if (!steering) this.work.begin(time)

    this.turns.begin(id, steering)
    this.store.put({
      kind: 'user',
      id,
      parentToolUseId: null,
      text,
      time,
      images: images.map((image) => ({ thumbnail: this.thumbnail(image) })),
      steering,
      ...extra,
    })
  }

  putShell(item: ShellFeedItem): void {
    this.store.put(item)
  }

  addNotice(code: NoticeCode, detail = '', extra: NoticeExtra = {}): void {
    this.store.put({
      kind: 'notice',
      id: this.nextId('notice'),
      parentToolUseId: null,
      code,
      detail,
      replayed: false,
      ...extra,
    })
  }

  turnStarted(): void {
    this.turnStartedAt = this.now()
    this.stopReason = null
  }

  /** Элемент начался или обновился; done - кончился (`item/completed`). */
  putItem(item: CodexItem, parent: string | null, done: boolean): void {
    const at = this.now()
    const startedAt = this.startedAt.get(item.id) ?? at

    this.startedAt.set(item.id, startedAt)

    if (item.type === 'agentMessage') return this.putText('assistant', item, parent, done)
    if (item.type === 'reasoning') return this.putText('thinking', item, parent, done)

    if (item.type === 'contextCompaction') {
      const trigger = this.compactTrigger

      if (done) this.compactTrigger = 'auto'

      return this.store.put({
        kind: 'compact',
        id: item.id,
        parentToolUseId: parent,
        pending: !done,
        startedAt,
        trigger,
        preTokens: 0,
        postTokens: 0,
        durationMs: done ? at - startedAt : 0,
      })
    }

    for (const tool of toolItemsOf(item, { parent, startedAt, endedAt: at })) this.store.put(tool)
  }

  /**
   * Кусок ответа или размышления по ходу (`item/agentMessage/delta`, `item/reasoning/*Delta`);
   * part - номер части рассуждения, новая часть идёт абзацем.
   */
  appendText(
    itemId: string,
    kind: 'assistant' | 'thinking',
    delta: string,
    parent: string | null,
    part = 0,
  ): void {
    if (kind === 'thinking') {
      const text = this.thoughts.append(itemId, delta, part)

      this.store.put({
        kind,
        id: itemId,
        parentToolUseId: parent,
        text,
        streaming: true,
        tokens: 0,
      })

      return
    }

    const known = this.store.get(itemId)
    const before = known?.kind === 'assistant' ? known.text : ''

    this.store.put({
      kind,
      id: itemId,
      parentToolUseId: parent,
      text: before + delta,
      streaming: true,
    })
  }

  /** Человек попросил сжать (/compact): следующее сжатие - его, после - снова Codex сам. */
  compactRequested(): void {
    this.compactTrigger = 'manual'
  }

  /** Откат разговора: сообщение и всё после него уходят из ленты. */
  truncateFrom(messageId: string): void {
    this.closeOpenWork('stopped', this.now())
    this.store.removeFrom(messageId)
    this.turns.afterTruncate()
  }

  /** Страница прошлых ходов (codex-replay.ts) - перед лентой; что уже стоит, не трогается. */
  prepend(items: readonly FeedItem[]): void {
    this.store.prepend(items)
  }

  /** План Codex - список задач над полем. */
  planUpdated(steps: readonly CodexPlanStep[]): void {
    this.taskEntries = steps.map((step, index) => ({
      id: String(index + 1),
      subject: step.step,
      activeForm: step.step,
      state: TASK_STATES[step.status] ?? 'pending',
    }))
    this.tasksChanged = true
  }

  /** Запрос повторяется (`error` с willRetry): отметка с причиной словами Codex. */
  retrying(message: string): void {
    this.addNotice('cli-error', message)
  }

  /** Ход кончился: незаконченное закрыто, строка хода с файлами; ошибка - строкой. */
  turnCompleted(end: CodexTurnEnd): void {
    const at = this.now()
    const interrupted = end.status === 'interrupted' || this.stopReason !== null

    this.closeOpenWork(interrupted ? 'stopped' : 'turnEnded', at)
    if (end.error) this.addNotice('cli-error', end.error)
    this.turns.finish({
      id: this.nextId('turn'),
      durationMs: this.work.elapsed(at) ?? (this.turnStartedAt ? at - this.turnStartedAt : 0),
      costUsd: 0,
      isError: end.status === 'failed',
      interrupted,
      ...(this.stopReason === 'account' && { forAccount: true }),
    })
    this.stopReason = null
  }

  noteStopped(reason: StopReason = 'you'): void {
    this.stopReason = reason
  }

  /** Ход оборвался без `turn/completed` (процесс умер или его сняли). */
  abortTurn(code: NoticeCode, detail: string): void {
    this.closeOpenWork(code === 'interrupted' ? 'stopped' : 'exited', this.now())
    this.addNotice(
      code,
      this.stopReason === 'account' && code === 'interrupted' ? 'account' : detail,
    )
    this.stopReason = null
  }

  abortBackground(reason: ClosedReason = 'exited'): void {
    this.closeOpenWork(reason, this.now())
  }

  drain(): { upserts: FeedItem[]; removes: string[]; tasks?: TaskEntry[] | undefined } {
    const upserts = this.store.drainTouched()
    const removes = this.store.drainRemoved()
    const tasks = this.tasksChanged ? this.taskEntries : undefined

    this.tasksChanged = false

    return { upserts, removes, tasks }
  }

  private putText(
    kind: 'assistant' | 'thinking',
    item: CodexItem,
    parent: string | null,
    done: boolean,
  ) {
    const known = this.store.get(item.id)
    const own =
      kind === 'assistant'
        ? typeof item['text'] === 'string'
          ? item['text']
          : ''
        : plainThought([...strings(item['summary']), ...strings(item['content'])].join('\n\n'))
    const text =
      own || (known && (known.kind === 'assistant' || known.kind === 'thinking') ? known.text : '')

    if (done) this.thoughts.forget(item.id)

    // Пустое (Codex открыл сообщение и не написал в нём ничего, например в ревью) - не пузырь.
    if (!text.trim()) {
      if (done && known) this.store.removeOne(item.id)

      return
    }

    this.store.put(
      kind === 'assistant'
        ? { kind, id: item.id, parentToolUseId: parent, text, streaming: !done }
        : { kind, id: item.id, parentToolUseId: parent, text, streaming: !done, tokens: 0 },
    )
  }

  /** Незаконченные вызовы - прерванными, текст, который ещё рос, - законченным. */
  private closeOpenWork(reason: ClosedReason, at: number) {
    for (const item of this.store.items) {
      if (item.kind === 'tool' && item.status === 'running') {
        this.store.put({ ...item, status: 'interrupted', closedReason: reason, endedAt: at })
      } else if ((item.kind === 'assistant' || item.kind === 'thinking') && item.streaming) {
        this.store.put({ ...item, streaming: false })
      }
    }
  }

  private nextId(prefix: string): string {
    this.sequence += 1

    return `${this.idPrefix}${prefix}-${this.sequence}`
  }
}

export const isCodexItem = (value: unknown): value is CodexItem =>
  isRecord(value) && typeof value['type'] === 'string' && typeof value['id'] === 'string'

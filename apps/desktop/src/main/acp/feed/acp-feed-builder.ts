import type { ImageAttachment } from '@shared/conversation'
import type {
  FeedItem,
  TaskEntry,
  NoticeCode,
  StopReason,
  ToolAction,
  NoticeExtra,
  ClosedReason,
  ToolFeedItem,
  UserFeedItem,
  ShellFeedItem,
} from '@shared/conversation-feed'

import type { AcpToolCall, AcpPlanEntry, AcpSessionUpdate } from '../protocol/acp-types'
import type { AgentFeedBuilder } from '../../agents/conversation/agent-parts'
import { FeedStore } from '../../agents/feed/feed-store'
import { toolTurnChanges } from '../../agents/feed/tool-turn-changes'
import { TurnTracker } from '../../agents/feed/turn-tracker'
import { WorkClock } from '../../agents/feed/work-clock'
import { failureCodeOf } from './acp-failures'
import { inputOf, acpToolAction, acpToolResult, mergeToolCall } from './acp-tools'

/** Как вызов выглядит в ленте: имя инструмента, вход, вид действия. */
export type AcpToolView = { name: string; input: Record<string, unknown>; action: ToolAction }

/**
 * Что агент знает о своих вызовах сверх схемы ACP (драйвер): имя инструмента, коннектор MCP,
 * вопрос, артефакт. base - разбор по общим полям.
 */
export type AcpToolLens = (call: AcpToolCall, base: AcpToolView) => AcpToolView

/** Устойчивая часть id вызова: у Kimi в живом потоке и при повторе разный номер до двоеточия. */
export type AcpToolId = (toolCallId: string) => string

/** Чем кончился ход ACP: причина остановки и ошибка запроса, если была. */
export type AcpTurnEnd = { stopReason: string; error: string }

const plainId: AcpToolId = (id) => id

/** Служебная вставка агента в «сообщении человека» при повторе истории. */
const SYSTEM_REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g

/**
 * Лента разговора ACP (ADR 0092): обновления сессии (`session/update`) - в общие элементы ленты.
 * У кусков ответа и размышления нет id сообщения: куски одного вида подряд - один элемент,
 * вызов или смена вида начинают новый. Вызов растёт от `tool_call` через обновления к итогу.
 * Повтор истории (`session/load`) идёт тем же путём: человек - `user_message_chunk`.
 */
export class AcpFeedBuilder implements AgentFeedBuilder {
  private readonly store = new FeedStore()
  readonly work = new WorkClock()
  private readonly turns = new TurnTracker(this.store, toolTurnChanges)
  private readonly calls = new Map<string, AcpToolCall>()
  private sequence = 0
  private stopReason: StopReason | null = null
  private turnStartedAt = 0
  /** Растущий текст: ответ или размышление, куда идут следующие куски того же вида. */
  private open: { kind: 'assistant' | 'thinking' | 'user'; id: string } | null = null
  private taskEntries: TaskEntry[] = []
  private tasksChanged = false

  /**
   * idPrefix - у ленты повтора истории: её элементы не совпадут с живыми. lens и toolId -
   * своё агента (драйвер).
   */
  constructor(
    private readonly thumbnail: (image: ImageAttachment) => string = () => '',
    private readonly now: () => number = Date.now,
    private readonly lens: AcpToolLens = (_call, base) => base,
    private readonly toolId: AcpToolId = plainId,
    private readonly idPrefix = '',
  ) {}

  get items(): readonly FeedItem[] {
    return this.store.items
  }

  get tasks(): readonly TaskEntry[] {
    return this.taskEntries
  }

  get hasBackgroundWork(): boolean {
    return false
  }

  get hasBackgroundCommands(): boolean {
    return false
  }

  addUserMessage(
    id: string,
    text: string,
    images: ImageAttachment[],
    steering: boolean,
    extra: Pick<UserFeedItem, 'draft' | 'editor' | 'auto'> = {},
  ): void {
    const time = this.now()

    this.closeText()
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
    this.closeText()
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

  /** Обновление сессии - в ленту; что не про ленту (модель, имя, окно), разбирает сессия. */
  update(update: AcpSessionUpdate): void {
    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        return this.appendText(
          'assistant',
          update.content.type === 'text' ? update.content.text : '',
        )
      case 'agent_thought_chunk':
        return this.appendText(
          'thinking',
          update.content.type === 'text' ? update.content.text : '',
        )
      case 'user_message_chunk':
        return this.replayedUser(update.content.type === 'text' ? update.content.text : '')
      case 'tool_call':
      case 'tool_call_update':
        return this.toolUpdate(update)
      case 'plan':
        return this.plan(update.entries)
      case 'compaction_update':
        return this.compaction(update.compactionId, update.status, update.error ?? '')
      default:
        return undefined
    }
  }

  /** Вызов не разрешён (ответ «нет» на вопрос разрешения): следом агент шлёт «failed». */
  toolDenied(toolCallId: string): void {
    this.store.update(this.toolId(toolCallId), 'tool', (tool) => ({
      ...tool,
      status: 'denied',
      endedAt: this.now(),
    }))
  }

  /**
   * Ход кончился: незаконченное закрыто, строка хода с файлами; ошибка - строкой. У хода из
   * повтора истории времени нет (ACP его не повторяет): строка хода - без него, а не с нулём.
   */
  turnCompleted(end: AcpTurnEnd, replayed = false): void {
    const at = this.now()
    const interrupted = end.stopReason === 'cancelled' || this.stopReason !== null

    this.closeOpenWork(interrupted ? 'stopped' : 'turnEnded', at)
    if (end.error) this.addNotice(failureCodeOf(end.error), end.error)
    if (end.stopReason === 'refusal') this.addNotice('cli-error', 'refusal')
    this.turns.finish({
      id: this.nextId('turn'),
      durationMs: replayed
        ? 0
        : (this.work.elapsed(at) ?? (this.turnStartedAt ? at - this.turnStartedAt : 0)),
      costUsd: 0,
      isError: Boolean(end.error),
      interrupted,
      ...(this.stopReason === 'account' && { forAccount: true }),
    })
    this.stopReason = null
  }

  /** Страница прошлых ходов - перед лентой; что уже стоит, не трогается. */
  prepend(items: readonly FeedItem[]): void {
    this.store.prepend(items)
  }

  noteStopped(reason: StopReason = 'you'): void {
    this.stopReason = reason
  }

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

  /** Повтор истории кончился: последний ход закрыт строкой хода, текст - законченным. */
  finishReplay(): void {
    if (this.store.items.some((item) => item.kind === 'user')) {
      this.turnCompleted({ stopReason: 'end_turn', error: '' }, true)
    }
    this.closeText()
  }

  drain(): { upserts: FeedItem[]; removes: string[]; tasks?: TaskEntry[] | undefined } {
    const tasks = this.tasksChanged ? this.taskEntries : undefined

    this.tasksChanged = false

    return { upserts: this.store.drainTouched(), removes: this.store.drainRemoved(), tasks }
  }

  private appendText(kind: 'assistant' | 'thinking', delta: string): void {
    if (!delta) return

    if (this.open?.kind !== kind) {
      this.closeText()
      this.open = { kind, id: this.nextId(kind === 'assistant' ? 'text' : 'think') }
    }

    const { id } = this.open
    const known = this.store.get(id)
    const before =
      known && (known.kind === 'assistant' || known.kind === 'thinking') ? known.text : ''

    this.store.put(
      kind === 'assistant'
        ? { kind, id, parentToolUseId: null, text: before + delta, streaming: true }
        : { kind, id, parentToolUseId: null, text: before + delta, streaming: true, tokens: 0 },
    )
  }

  /**
   * Сообщение человека из повтора истории: куски подряд - одно сообщение. Новое сообщение
   * закрывает прошлый ход строкой хода.
   */
  private replayedUser(chunk: string): void {
    // Служебные вставки агента (Kimi повторяет свои `<system-reminder>` кусками человека) - не
    // слова человека: вырезаются, кусок только из них не начинает сообщения.
    const delta = chunk.replace(SYSTEM_REMINDER, '')

    if (!delta.trim()) return

    if (this.open?.kind === 'user') {
      const known = this.store.get(this.open.id)

      if (known?.kind === 'user') this.store.put({ ...known, text: known.text + delta })

      return
    }

    if (this.store.items.some((item) => item.kind === 'user')) {
      this.turnCompleted({ stopReason: 'end_turn', error: '' }, true)
    }

    const id = this.nextId('user')

    this.addUserMessage(id, delta, [], false)
    this.open = { kind: 'user', id }
  }

  private toolUpdate(update: AcpToolCall): void {
    this.closeText()

    const id = this.toolId(update.toolCallId)
    const call = mergeToolCall(this.calls.get(id), update)
    const known = this.store.get(id)
    const previous = known?.kind === 'tool' ? known : null
    // Имя инструмента - из первого сообщения о вызове: у Kimi `title` потом становится
    // описанием («Reading README.md»), у `agy` имя - в незаявленном поле `name`.
    const base: AcpToolView = {
      name: typeof call['name'] === 'string' ? call['name'] : previous?.name || (call.title ?? ''),
      input: inputOf(call),
      action: acpToolAction(call),
    }
    const view = this.lens(call, base)
    const ended = call.status === 'completed' || call.status === 'failed'
    const result = ended ? acpToolResult(call, call.status === 'failed') : null

    this.calls.set(id, call)
    this.store.put({
      kind: 'tool',
      id,
      parentToolUseId: null,
      name: view.name,
      input: view.input,
      action: view.action,
      // Отказ человека остаётся отказом: следом агент шлёт «failed».
      status:
        previous?.status === 'denied'
          ? 'denied'
          : !ended
            ? 'running'
            : result?.isError
              ? 'error'
              : 'done',
      result: result ?? previous?.result ?? null,
      startedAt: previous?.startedAt ?? this.now(),
      endedAt: ended ? this.now() : 0,
      closedReason: null,
    } satisfies ToolFeedItem)
  }

  private plan(entries: readonly AcpPlanEntry[]): void {
    this.taskEntries = entries.map((entry, index) => ({
      id: String(index + 1),
      subject: entry.content,
      activeForm: entry.content,
      state: entry.status,
    }))
    this.tasksChanged = true
  }

  /** Сжатие разговора: карточка по id сжатия, неудачное - строкой ошибки. */
  private compaction(compactionId: string, status: string, error: string): void {
    const id = `${this.idPrefix}compact-${compactionId}`
    const known = this.store.get(id)
    const startedAt = known?.kind === 'compact' ? known.startedAt : this.now()

    this.closeText()

    if (status === 'failed') {
      if (known) this.store.removeOne(id)
      this.addNotice('cli-error', error)

      return
    }

    const done = status === 'completed'

    this.store.put({
      kind: 'compact',
      id,
      parentToolUseId: null,
      pending: !done,
      startedAt,
      trigger: 'manual',
      preTokens: 0,
      postTokens: 0,
      durationMs: done ? this.now() - startedAt : 0,
    })
  }

  private closeText(): void {
    const open = this.open

    this.open = null

    if (!open || open.kind === 'user') return

    const known = this.store.get(open.id)

    if (known && (known.kind === 'assistant' || known.kind === 'thinking') && known.streaming) {
      this.store.put({ ...known, streaming: false })
    }
  }

  /** Незаконченные вызовы - прерванными, текст, который ещё рос, - законченным. */
  private closeOpenWork(reason: ClosedReason, at: number) {
    this.closeText()

    for (const item of this.store.items) {
      if (item.kind === 'tool' && item.status === 'running') {
        this.store.put({ ...item, status: 'interrupted', closedReason: reason, endedAt: at })
      }
    }
  }

  private nextId(prefix: string): string {
    this.sequence += 1

    return `${this.idPrefix}${prefix}-${this.sequence}`
  }
}

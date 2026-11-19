import type { ImageAttachment } from '@shared/conversation'
import type {
  FeedItem,
  TaskEntry,
  NoticeCode,
  StopReason,
  NoticeExtra,
  ClosedReason,
  ToolFeedItem,
  UserFeedItem,
  ShellFeedItem,
} from '@shared/conversation-feed'

import type { AgentFeedBuilder } from '../../agents/conversation/agent-parts'
import { FeedStore } from '../../agents/feed/feed-store'
import { toolTurnChanges } from '../../agents/feed/tool-turn-changes'
import { TurnTracker } from '../../agents/feed/turn-tracker'
import { WorkClock } from '../../agents/feed/work-clock'
import type { ToolContext, OpenCodeFileChange } from './opencode-tools'
import {
  openCodeToolName,
  openCodeToolAction,
  openCodeToolResult,
  openCodeFileChanges,
} from './opencode-tools'

/** Чем кончился ход OpenCode (`session.execution.*`). */
export type OpenCodeTurnEnd = { status: 'succeeded' | 'failed' | 'interrupted'; error: string }

/** Текст или размышление сообщения модели: id сообщения и номер части. */
type TextKey = { messageId: string; ordinal: number }

/** Строка файла правки: новый файл - запись, прочие - правка. */
const fileAction = (file: OpenCodeFileChange) =>
  file.created
    ? ({ kind: 'write', path: file.path, preview: file.hunks, lines: 0 } as const)
    : ({ kind: 'edit', path: file.path, preview: file.hunks } as const)

/**
 * Лента разговора OpenCode (ADR 0084): события сервера (`session.*`) - в общие элементы ленты.
 * Ответ и размышление растут кусками, вызов идёт от имени к входу и к итогу, конец хода -
 * строка хода с файлами. Что ядро делает с лентой сверх этого (остановка, обрыв, часы работы),
 * - через AgentFeedBuilder, как у Claude и Codex.
 */
export class OpenCodeFeedBuilder implements AgentFeedBuilder {
  private readonly store = new FeedStore()
  readonly work = new WorkClock()
  private readonly turns = new TurnTracker(this.store, toolTurnChanges)
  private sequence = 0
  private stopReason: StopReason | null = null
  private turnStartedAt = 0
  private compactTrigger: 'manual' | 'auto' = 'auto'
  /** Идущее сжатие: его карточка закроется событием конца. */
  private compactId = ''
  /** Сессии субагентов, чей ход идёт. */
  private readonly subagents = new Set<string>()

  /**
   * context - имена серверов MCP процесса и папка проекта (opencode-tools.ts).
   * idPrefix - у страницы истории: её строки хода и отметки не совпадут с живыми.
   */
  constructor(
    private readonly thumbnail: (image: ImageAttachment) => string = () => '',
    private readonly now: () => number = Date.now,
    private readonly context: () => ToolContext = () => ({ servers: [], root: '' }),
    private readonly idPrefix = '',
  ) {}

  get items(): readonly FeedItem[] {
    return this.store.items
  }

  /**
   * Субагенты OpenCode 2.3.2 работают в фоне: вызов `subagent` отвечает сразу, ход разговора
   * может кончиться раньше них, а их конец будит разговор новым ходом. Пока хоть один идёт,
   * разговор работает: не спит и не перезапускается.
   */
  get hasBackgroundWork(): boolean {
    return this.subagents.size > 0
  }

  /** Субагент (его сессия) начал или кончил ход. */
  subagentRunning(sessionId: string, running: boolean): void {
    if (running) this.subagents.add(sessionId)
    else this.subagents.delete(sessionId)
  }

  /** Идущие субагенты: Stop останавливает и их. */
  get runningSubagents(): string[] {
    return [...this.subagents]
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

  /** Кусок ответа (`session.text.delta`) или размышления (`session.reasoning.delta`). */
  appendText(kind: 'assistant' | 'thinking', key: TextKey, delta: string): void {
    const id = this.textId(kind, key)
    const known = this.store.get(id)
    const before =
      known && (known.kind === 'assistant' || known.kind === 'thinking') ? known.text : ''

    this.store.put(
      kind === 'assistant'
        ? { kind, id, parentToolUseId: null, text: before + delta, streaming: true }
        : { kind, id, parentToolUseId: null, text: before + delta, streaming: true, tokens: 0 },
    )
  }

  /** Текст кончился (`session.text.ended`, `session.reasoning.ended`): его полный текст. */
  endText(kind: 'assistant' | 'thinking', key: TextKey, full: string): void {
    const id = this.textId(kind, key)
    const known = this.store.get(id)
    const text =
      full || (known && (known.kind === 'assistant' || known.kind === 'thinking') ? known.text : '')

    if (!text.trim()) {
      if (known) this.store.removeOne(id)

      return
    }

    this.store.put(
      kind === 'assistant'
        ? { kind, id, parentToolUseId: null, text, streaming: false }
        : { kind, id, parentToolUseId: null, text, streaming: false, tokens: 0 },
    )
  }

  /** Модель начала вызов (`session.tool.input.started`): имя есть, входа ещё нет. */
  toolStarted(id: string, name: string): void {
    if (this.store.get(id)) return

    this.store.put({
      kind: 'tool',
      id,
      parentToolUseId: null,
      name,
      input: {},
      action: openCodeToolAction(name, {}, this.context()),
      status: 'running',
      result: null,
      startedAt: this.now(),
      endedAt: 0,
      closedReason: null,
    })
  }

  /** Вход вызова (`session.tool.called`): действие - уже по нему. */
  toolCalled(id: string, name: string, input: Record<string, unknown>): void {
    this.toolStarted(id, name)
    this.updateTool(id, (tool) => ({
      ...tool,
      input,
      action: openCodeToolAction(tool.name, input, this.context()),
    }))
  }

  /**
   * Итог вызова (`session.tool.success` / `failed`). `patch` на несколько файлов - строкой на
   * файл, как правка Codex: строка хода и откат считают файлы по строкам ленты.
   */
  toolEnded(id: string, data: Record<string, unknown>, failed: boolean): void {
    const known = this.store.get(id)
    const files = openCodeFileChanges(data, this.context().root)
    const split =
      known?.kind === 'tool' && openCodeToolName(known.name) === 'patch' && files.length > 1
    const [first, ...others] = files
    const result = openCodeToolResult(data, failed, split ? files.slice(0, 1) : files)
    const endedAt = this.now()

    this.updateTool(id, (tool) => ({
      ...tool,
      ...(split && first && { action: fileAction(first) }),
      // Отказ человека остаётся отказом: следом OpenCode шлёт сбой вызова.
      status: tool.status === 'denied' ? 'denied' : result.isError ? 'error' : 'done',
      result,
      endedAt,
    }))

    if (!split || known?.kind !== 'tool') return

    for (const [index, file] of others.entries()) {
      const part = openCodeToolResult({ ...data, content: [] }, failed, [file])

      this.store.put({
        ...known,
        id: `${id}#${index + 1}`,
        action: fileAction(file),
        status: part.isError ? 'error' : 'done',
        result: part,
        endedAt,
      })
    }
  }

  /** Вызов не разрешён (ответ «нет» на вопрос разрешения). */
  toolDenied(id: string): void {
    this.updateTool(id, (tool) => ({ ...tool, status: 'denied', endedAt: this.now() }))
  }

  /** Человек попросил сжать (/compact): следующее сжатие - его. */
  compactRequested(): void {
    this.compactTrigger = 'manual'
  }

  /**
   * Сжатие разговора (`session.compaction.*`): у событий нет своего id - каждое сжатие
   * получает свой, иначе второе встало бы на место первого. Сжатие не вышло - карточка уходит,
   * причина - строкой ошибки.
   */
  compaction(phase: 'started' | 'ended' | 'failed', error = ''): void {
    const id = phase === 'started' || !this.compactId ? this.nextId('compact') : this.compactId
    const known = this.store.get(id)
    const startedAt = known?.kind === 'compact' ? known.startedAt : this.now()
    const trigger = this.compactTrigger

    this.compactId = phase === 'started' ? id : ''
    if (phase !== 'started') this.compactTrigger = 'auto'

    if (phase === 'failed') {
      if (known) this.store.removeOne(id)
      this.addNotice('cli-error', error)

      return
    }

    this.store.put({
      kind: 'compact',
      id,
      parentToolUseId: null,
      pending: phase === 'started',
      startedAt,
      trigger,
      preTokens: 0,
      postTokens: 0,
      durationMs: phase === 'ended' ? this.now() - startedAt : 0,
    })
  }

  /** Запрос модели повторится (`session.retry.scheduled`): отметка с причиной. */
  retrying(message: string): void {
    this.addNotice('cli-error', message)
  }

  /** Ход кончился: незаконченное закрыто, строка хода с файлами; ошибка - строкой. */
  turnCompleted(end: OpenCodeTurnEnd): void {
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

  /** Откат разговора: сообщение и всё после него уходят из ленты. */
  truncateFrom(messageId: string): void {
    this.closeOpenWork('stopped', this.now())
    this.store.removeFrom(messageId)
    this.turns.afterTruncate()
  }

  /** Страница прошлых ходов - перед лентой; что уже стоит, не трогается. */
  prepend(items: readonly FeedItem[]): void {
    this.store.prepend(items)
  }

  noteStopped(reason: StopReason = 'you'): void {
    this.stopReason = reason
  }

  /** Ход оборвался без конца хода (процесс умер или его сняли). */
  abortTurn(code: NoticeCode, detail: string): void {
    this.closeOpenWork(code === 'interrupted' ? 'stopped' : 'exited', this.now())
    this.addNotice(
      code,
      this.stopReason === 'account' && code === 'interrupted' ? 'account' : detail,
    )
    this.stopReason = null
  }

  /** Процесс кончился или заменён: его субагенты кончились с ним. */
  abortBackground(reason: ClosedReason = 'exited'): void {
    this.subagents.clear()
    this.closeOpenWork(reason, this.now())
  }

  drain(): { upserts: FeedItem[]; removes: string[]; tasks?: TaskEntry[] | undefined } {
    return { upserts: this.store.drainTouched(), removes: this.store.drainRemoved() }
  }

  private textId(kind: 'assistant' | 'thinking', key: TextKey): string {
    return `${key.messageId}:${kind === 'assistant' ? 'text' : 'think'}:${key.ordinal}`
  }

  private updateTool(id: string, change: (tool: ToolFeedItem) => ToolFeedItem): void {
    this.store.update(id, 'tool', change)
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

import type { CliTask, ToolFeedItem, CliTaskOutcome } from '@shared/conversation-feed'

import { isRecord, numberField, stringField } from '../cli/cli-messages'
import type { FeedStore } from '../../agents/feed/feed-store'

/** Инструмент, которым агент ставит себе будильник. */
const WAKEUP_TOOL = 'ScheduleWakeup'

/** Ход, начатый чуть раньше срока, - тоже он: часы CLI и строки потока расходятся на доли секунды. */
const FIRE_SLACK_MS = 1_000

const wakeupTask = (call: ToolFeedItem, dueAt: number, at: number): CliTask => ({
  taskId: '',
  kind: 'wakeup',
  background: true,
  startedAt: at,
  endedAt: 0,
  activity: stringField(call.input, 'prompt'),
  steps: [],
  trimmed: 0,
  fleet: null,
  outcome: null,
  summary: '',
  dueAt,
})

/**
 * Будильник, который агент ставит себе сам (ScheduleWakeup). Его держит процесс CLI и в срок
 * сам начинает ход без нашего сообщения - так на CLI 2.1.293: результат вызова несёт
 * scheduledFor (мс), срабатывание - ход с init без строки человека (__fixtures__/wakeup.ndjson).
 * Пока будильник стоит, разговор не простаивает: процесс не спит и не перезапускается, над
 * лентой - чип со временем (задача вызова kind wakeup). Новый будильник заменяет прежний,
 * stop снимает. Только живой поток: у транскрипта процесса уже нет, и будильника тоже.
 */
export class WakeupWatch {
  /** Будильник, который ещё не сработал: id вызова и срок (мс). */
  private pending: { id: string; dueAt: number } | null = null

  constructor(
    private readonly store: FeedStore,
    private readonly isLive: () => boolean,
  ) {}

  get isSet(): boolean {
    return this.pending !== null
  }

  /** Результат вызова: будильник встал (scheduledFor) или снят (stop, ошибка). */
  onToolResult(call: ToolFeedItem, structured: unknown, at: number): void {
    if (call.name !== WAKEUP_TOOL || !this.isLive()) return

    const dueAt = isRecord(structured) ? numberField(structured, 'scheduledFor') : 0

    // Прежний будильник CLI заменил или снял: он не сработает и не пропал - просто закрыт.
    this.settle('completed', at)

    if (call.input['stop'] === true || call.status !== 'done' || dueAt <= 0) return

    this.pending = { id: call.id, dueAt }
    this.store.put({ ...call, task: wakeupTask(call, dueAt, at) })
  }

  /**
   * Строка хода (его начало или итог) в срок будильника или позже: он сработал - начал свой
   * ход или, пришедшийся на чужой, встал за ним в очередь CLI.
   */
  noteTurn(at: number): void {
    if (this.pending && at >= this.pending.dueAt - FIRE_SLACK_MS) this.settle('completed', at)
  }

  /** Процесс ушёл: стоящий будильник пропал с ним. Его срок (мс) или null - не стоял. */
  release(at: number): number | null {
    const dueAt = this.pending?.dueAt ?? null

    this.settle('stopped', at)

    return dueAt
  }

  /** Забыть учёт, не трогая ленту: транскрипт прочитан. */
  forget(): void {
    this.pending = null
  }

  private settle(outcome: CliTaskOutcome, at: number) {
    const item = this.pending ? this.store.get(this.pending.id) : undefined

    this.pending = null

    if (item?.kind === 'tool' && item.task) {
      this.store.put({ ...item, task: { ...item.task, outcome, endedAt: at } })
    }
  }
}

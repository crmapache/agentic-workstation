import type { ToolFeedItem } from '@shared/conversation-feed'

import type { CliMessage } from '../cli/cli-messages'
import { stringField } from '../cli/cli-messages'
import type { FeedStore } from '../../agents/feed/feed-store'
import type { ProcessBackground } from './process-background'
import type { TaskList } from './task-list'
import { wasRejected, buildToolResult } from './tool-result'

/** Отказ разрешения в транскрипте, где метаданных отказа нет. */
const REJECTION_TEXT = /^(The user doesn't want to proceed|Permission to use .* (was )?denied)/

/** Результат, чей вызов ещё не в ленте: вызов на странице выше, её подгрузят позже. */
type Orphan = {
  block: Record<string, unknown>
  structured: unknown
  message: CliMessage
  at: number
}

/**
 * Результаты вызовов из строк `user`: статус, вывод, время конца. Субагент, ушедший в
 * фон, - не результат, а запуск: он отчитается уведомлением; будильник агента - результат,
 * после которого процесс ещё разбудит агента. Результат без своего вызова в ленте (вызов
 * выше прочитанного куска транскрипта) ждёт, пока подгрузят страницу.
 */
export class ToolResults {
  private readonly orphans = new Map<string, Orphan>()

  constructor(
    private readonly store: FeedStore,
    private readonly taskList: TaskList,
    private readonly background: ProcessBackground,
  ) {}

  /** Результаты одной строки. true - поменялся список задач. */
  apply(message: CliMessage, results: Record<string, unknown>[], at: number): boolean {
    const structured = message['tool_use_result'] ?? message['toolUseResult']
    let tasksChanged = false

    for (const block of results) {
      const changed = this.applyOne(
        block,
        results.length === 1 ? structured : undefined,
        message,
        at,
      )

      tasksChanged ||= changed
    }

    return tasksChanged
  }

  /** Подгружена страница выше: её вызовы получают результаты, пришедшие раньше них. */
  adopt(from: ToolResults): boolean {
    let tasksChanged = false

    for (const [id, orphan] of from.orphans) {
      if (this.store.get(id)?.kind !== 'tool') continue

      from.orphans.delete(id)

      const changed = this.applyOne(orphan.block, orphan.structured, orphan.message, orphan.at)

      tasksChanged ||= changed
    }

    return tasksChanged
  }

  /** Результаты, которых и на этой странице ждать некому, - тому, кто стоит ниже. */
  handOver(to: ToolResults): void {
    for (const [id, orphan] of this.orphans) to.orphans.set(id, orphan)

    this.orphans.clear()
  }

  clear(): void {
    this.orphans.clear()
  }

  private applyOne(
    block: Record<string, unknown>,
    structured: unknown,
    message: CliMessage,
    at: number,
  ): boolean {
    const id = stringField(block, 'tool_use_id')
    const item = this.store.get(id)

    if (item?.kind !== 'tool') {
      if (id) this.orphans.set(id, { block, structured, message, at })

      return false
    }

    const result = buildToolResult(block, structured)

    // Агент или флот ушёл в фон: работа идёт, отчёт придёт уведомлением (task_notification).
    if (this.background.agents.onToolResult(item, result.text)) return false

    const rejected =
      wasRejected(message, id) || (result.isError && REJECTION_TEXT.test(result.text))
    const done: ToolFeedItem = {
      ...item,
      status: rejected ? 'denied' : result.isError ? 'error' : 'done',
      result,
      endedAt: at,
      closedReason: null,
    }

    this.store.put(done)
    this.background.wakeup.onToolResult(done, structured, at)

    return this.taskList.applyToolResult(id, structured, result.text)
  }
}

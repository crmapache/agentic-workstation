import type { ScenarioQueue } from '@shared/scenario-queues'

import type { JsonFile } from '../../storage/json-file'
import type { StoredQueues } from './queue-parse'
import { parseStoredQueues } from './queue-parse'

/** Сколько закрытых очередей помнить: дальше история - это прогоны, а не очереди. */
const CLOSED_KEPT = 100

/**
 * Все очереди всех проектов этой IDE - в памяти главного процесса, копией на диске. Очереди
 * живут в userData своего профиля IDE: dev и установленная IDE держат свои, и замков между
 * процессами не нужно (в отличие от полок ACC, общих для двух программ).
 */
export class QueueBook {
  private readonly queues = new Map<string, ScenarioQueue>()
  private writing: Promise<void> = Promise.resolve()

  private constructor(private readonly file: JsonFile<StoredQueues>) {}

  static async load(file: JsonFile<StoredQueues>): Promise<QueueBook> {
    const book = new QueueBook(file)

    for (const queue of parseStoredQueues(await file.read())) book.queues.set(queue.id, queue)

    return book
  }

  get(id: string): ScenarioQueue | null {
    return this.queues.get(id) ?? null
  }

  /** Открытые сначала, внутри - по времени создания. */
  all(): ScenarioQueue[] {
    return [...this.queues.values()].sort(
      (left, right) =>
        Number(left.closedAt > 0) - Number(right.closedAt > 0) || left.createdAt - right.createdAt,
    )
  }

  byRun(runId: string): { queue: ScenarioQueue; itemId: string } | null {
    for (const queue of this.queues.values()) {
      const item = queue.items.find((one) => one.runId === runId)

      if (item) return { queue, itemId: item.id }
    }

    return null
  }

  /** Записать изменённую очередь; та же самая (ничего не поменялось) - без записи. */
  put(queue: ScenarioQueue): boolean {
    if (this.queues.get(queue.id) === queue) return false

    this.queues.set(queue.id, queue)
    this.prune()
    this.save()

    return true
  }

  /** Записи - по очереди: поздняя не ляжет под раннюю. */
  save(): void {
    const snapshot: StoredQueues = { version: 1, queues: [...this.queues.values()] }

    this.writing = this.writing
      .then(() => this.file.write(snapshot))
      .catch((error: unknown) => console.warn('[scenarios] очереди не записались:', error))
  }

  /** Выход из IDE ждёт последнюю запись. */
  settle(): Promise<void> {
    return this.writing
  }

  private prune() {
    const closed = [...this.queues.values()]
      .filter((queue) => queue.closedAt > 0)
      .sort((left, right) => right.closedAt - left.closedAt)

    for (const queue of closed.slice(CLOSED_KEPT)) this.queues.delete(queue.id)
  }
}

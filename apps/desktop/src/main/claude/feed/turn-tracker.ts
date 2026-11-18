import type { FileChange, TurnFeedItem } from '@shared/claude-feed'

import { turnChanges } from '../changes/turn-changes'
import type { FeedStore } from '../../agents/feed/feed-store'

/** Итог хода без того, что считает учёт: файлы и можно ли их откатить. */
export type TurnFields = Omit<TurnFeedItem, 'kind' | 'parentToolUseId' | 'changes' | 'revertable'>

/**
 * Ходы в ленте: с какого элемента идёт текущий и каким сообщением человека начат,
 * последний итог. Итог несёт файлы хода; откатить их можно, пока после него ничего
 * не написано.
 */
export class TurnTracker {
  private start = { index: 0, messageId: '' }
  private last: { id: string; messageId: string } | null = null

  constructor(private readonly store: FeedStore) {}

  /** Последний итог хода и сообщение, которым ход начат: откат файлов идёт к нему. */
  get latest(): { id: string; messageId: string } | null {
    return this.last
  }

  /** Новое сообщение человека. Посреди хода (steering) ход не начинает. */
  begin(messageId: string, steering: boolean): void {
    if (this.last) {
      this.store.update(this.last.id, 'turn', (turn) => ({ ...turn, revertable: false }))
    }

    this.last = null
    if (!steering) this.start = { index: this.store.items.length, messageId }
  }

  /** Ход кончился: итог с файлами всех правок от начала хода. */
  finish(fields: TurnFields): void {
    const changes = turnChanges(this.store.items.slice(this.start.index))
    const { messageId } = this.start

    this.store.put({
      kind: 'turn',
      parentToolUseId: null,
      ...fields,
      changes,
      // Откат идёт по диффам самого хода, копии CLI ему не нужны: откатывается и ход,
      // начатый уведомлением фоновой задачи. Кнопки - у файлов с точным диффом (undoable).
      revertable: changes.length > 0,
    })
    this.last = { id: fields.id, messageId }
    this.start = { index: this.store.items.length, messageId: '' }
  }

  /** Поменять строки файлов в итоге хода (откат, возврат, отказ). */
  updateChanges(turnId: string, change: (changes: FileChange[]) => FileChange[]): void {
    this.store.update(turnId, 'turn', (turn) => ({ ...turn, changes: change(turn.changes) }))
  }

  /** Ленту обрезал откат: отрезанный итог забывается, следующий ход - с конца ленты. */
  afterTruncate(): void {
    if (this.last && !this.store.get(this.last.id)) this.last = null

    this.start = { index: this.store.items.length, messageId: '' }
  }
}

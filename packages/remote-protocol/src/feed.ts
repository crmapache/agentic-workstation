import type { FeedPatchMessage, FeedSnapshotMessage } from './agent-messages'
import type { FeedItemWire, FeedTaskWire } from './wire-types'

/**
 * Лента разговора на телефоне: снимок и заплатки по номеру - те же правила, что у ленты окна
 * IDE (applyFeedPatch): сначала снятые, потом вставки по id - новый элемент встаёт в конец,
 * известный меняется на месте.
 */
export type FeedView = {
  conversationId: string
  epoch: string
  /** Номер последней применённой заплатки: с ним телефон подписывается заново (since). */
  seq: number
  items: FeedItemWire[]
  tasks: FeedTaskWire[]
  hasEarlier: boolean
}

export const feedFromSnapshot = (snapshot: FeedSnapshotMessage): FeedView => ({
  conversationId: snapshot.conversationId,
  epoch: snapshot.epoch,
  seq: snapshot.seq,
  items: snapshot.items,
  tasks: snapshot.tasks,
  hasEarlier: snapshot.hasEarlier,
})

/**
 * Применить заплатку. Уже применённая (номер не больше своего) - лента как была; пропуск номера
 * или другая жизнь IDE - null: подписаться заново с `since: view.seq, epoch: view.epoch`.
 */
export const applyFeedPatch = (view: FeedView, patch: FeedPatchMessage): FeedView | null => {
  if (patch.conversationId !== view.conversationId || patch.epoch !== view.epoch) return null
  if (patch.seq <= view.seq) return view
  if (patch.seq !== view.seq + 1) return null

  const removed = new Set(patch.removes ?? [])
  const items = view.items.filter((item) => !removed.has(item.id))
  const positions = new Map(items.map((item, index) => [item.id, index]))

  for (const item of patch.upserts) {
    const position = positions.get(item.id)

    if (position === undefined) {
      positions.set(item.id, items.length)
      items.push(item)
    } else {
      items[position] = item
    }
  }

  return {
    ...view,
    seq: patch.seq,
    items,
    tasks: patch.tasks ?? view.tasks,
    hasEarlier: patch.hasEarlier ?? view.hasEarlier,
  }
}

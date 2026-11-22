import type { TrackerCardFields } from '@shared/tracker'
import { isLockedWith, TRACKER_LOCK_OPEN } from '@shared/tracker'

import type { TrackerBook } from './tracker-book'
import { TrackerError } from './tracker-fields'
import { rankBefore, rankBetween } from './tracker-rank'
import type { RecordKind, TrackerRecord } from './tracker-records'
import { numberOf } from './tracker-records'
import type { Ranked, TrackerTree } from './tracker-tree'
import type { CardLocal } from './tracker-view'
import { cardOf } from './tracker-view'

/**
 * Проверки правки доски: запись живая, своя (того же пространства) и не в архиве. Идут до первой
 * записи в книгу: отказ не оставляет полуправки.
 */

/**
 * Где идёт правка: книга, пространство доски, папка проекта IDE, из которой правят (запуск в
 * срок помнит её), время правки и то, что о карточках знает только этот компьютер (очереди).
 */
export type OpContext = {
  book: TrackerBook
  spaceId: string
  projectPath: string
  now: number
  local: CardLocal
}

/** Живая запись своей доски или отказ: чужая доска - wrongBoard, нет такой - notFound. */
export const own = (
  ctx: OpContext,
  tree: TrackerTree,
  id: string,
  kind: RecordKind,
): TrackerRecord => {
  const record = tree.alive(id, kind)

  if (!record) throw new TrackerError('notFound')
  if (tree.spaceOf(id) !== ctx.spaceId) throw new TrackerError('wrongBoard')

  return record
}

/** Проект, куда можно класть: в архиве - отказ. */
export const openProject = (ctx: OpContext, tree: TrackerTree, id: string) => {
  const project = own(ctx, tree, id, 'project')

  if (numberOf(project, 'archivedAt') !== null) throw new TrackerError('archived')

  return project
}

/** Ветка, в которой лежит запись, не в архиве: поток и группу архивного проекта не правят. */
export const openBranch = (ctx: OpContext, tree: TrackerTree, id: string, kind: RecordKind) => {
  const record = own(ctx, tree, id, kind)
  const project = tree.ancestor(id, 'project')

  if (project && numberOf(project, 'archivedAt') !== null) throw new TrackerError('archived')

  return record
}

/**
 * Карточка со сценарием в работе (ADR 0110) принимает только описание и «сделано»; выполненную
 * сценарием открывает снятая отметка той же правкой. Поле с прежним значением - не правка: модель
 * могла прислать его заново вместе с описанием.
 */
export const assertOpenFields = (
  ctx: OpContext,
  record: TrackerRecord,
  fields: Partial<TrackerCardFields>,
) => {
  const card = cardOf(record, ctx.local)

  if (!isLockedWith(card.lock, fields.done ?? card.done)) return

  const closed = (Object.keys(fields) as (keyof TrackerCardFields)[]).some(
    (key) =>
      !TRACKER_LOCK_OPEN.includes(key) && JSON.stringify(fields[key]) !== JSON.stringify(card[key]),
  )

  if (closed) throw new TrackerError('locked')
}

/** Живые проекты доски не из архива, по месту. */
export const openProjects = (tree: TrackerTree, spaceId: string) =>
  tree.children(spaceId, 'project').filter((one) => numberOf(one.record, 'archivedAt') === null)

/**
 * Место перед beforeId в списке (null - в конец). Два соседа с одним местом (вставки с двух
 * машин в одну мс) между собой места не оставляют: сначала второй из них сдвигается чуть дальше,
 * и новое встаёт ровно туда, где была линия броска.
 */
export const slotBefore = (
  ctx: OpContext,
  list: readonly Ranked[],
  beforeId: string | null,
): string => {
  const index = beforeId === null ? -1 : list.findIndex((item) => item.id === beforeId)
  const previous = index > 0 ? list[index - 1] : undefined
  const next = index > 0 ? list[index] : undefined

  if (previous && next && previous.rank === next.rank) {
    const after = list.slice(index + 1).find((item) => item.rank > next.rank)?.rank ?? null
    const moved = rankBetween(next.rank, after)

    ctx.book.write(next.id, { rank: moved }, true)

    return rankBetween(previous.rank, moved)
  }

  return rankBefore(list, beforeId)
}

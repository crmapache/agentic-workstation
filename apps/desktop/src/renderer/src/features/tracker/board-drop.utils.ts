import { CHAIN_EDGE_SHARE } from './tracker.constants'
import type { BoardNeighbours } from './tracker.utils'
import type { Rect, DropHit, DropMark, DropPlace, DragSource } from './Board/Board.types'

type Placed = { place: DropPlace; mark: DropMark }

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

// Линия места - посреди зазора до соседа: «после A» и «перед B» рисуются одной линией.
const above = (rect: Rect, gap: number): DropMark => ({
  axis: 'h',
  x: rect.left,
  y: rect.top - gap / 2,
  length: rect.width,
})
const below = (rect: Rect, gap: number): DropMark => ({
  axis: 'h',
  x: rect.left,
  y: rect.top + rect.height + gap / 2,
  length: rect.width,
})
const leftOf = (rect: Rect, gap: number): DropMark => ({
  axis: 'v',
  x: rect.left - gap / 2,
  y: rect.top,
  length: rect.height,
})
const rightOf = (rect: Rect, gap: number): DropMark => ({
  axis: 'v',
  x: rect.left + rect.width + gap / 2,
  y: rect.top,
  length: rect.height,
})

/**
 * Место карточки под рукой. Над задачей - выше или ниже её в группе, у её правого края - первой
 * в её цепочке; над продолжением - левее или правее в цепочке; над колонкой мимо карточек -
 * задачей в конец группы. Задачу не кладут в её же цепочку - такого места нет.
 */
const cardPlace = (
  hit: DropHit,
  x: number,
  y: number,
  source: DragSource,
  near: BoardNeighbours,
): Placed | null => {
  const own = new Set([source.id, ...(near.followUpsOf.get(source.id) ?? [])])

  if (hit.kind === 'card') {
    if (own.has(hit.id)) return null

    if (hit.followUp) {
      const rootId = near.rootOf.get(hit.id) ?? null

      if (!rootId || own.has(rootId)) return null

      const before = x < hit.rect.left + hit.rect.width / 2

      return {
        place: {
          kind: 'card',
          groupId: hit.groupId,
          followUpOf: rootId,
          beforeId: before ? hit.id : (near.nextFollowUp.get(hit.id) ?? null),
        },
        mark: before ? leftOf(hit.rect, hit.chainGap) : rightOf(hit.rect, hit.chainGap),
      }
    }

    if (x > hit.rect.left + hit.rect.width * (1 - CHAIN_EDGE_SHARE)) {
      return {
        place: {
          kind: 'card',
          groupId: hit.groupId,
          followUpOf: hit.id,
          beforeId: near.followUpsOf.get(hit.id)?.[0] ?? null,
        },
        mark: rightOf(hit.rect, hit.chainGap),
      }
    }

    const before = y < hit.rect.top + hit.rect.height / 2

    return {
      place: {
        kind: 'card',
        groupId: hit.groupId,
        followUpOf: null,
        beforeId: before ? hit.id : (near.nextTask.get(hit.id) ?? null),
      },
      mark: before ? above(hit.rect, hit.gap) : below(hit.rect, hit.gap),
    }
  }

  if (hit.kind === 'group' && hit.end) {
    return {
      place: { kind: 'card', groupId: hit.id, followUpOf: null, beforeId: null },
      mark: above(hit.end, hit.gap),
    }
  }

  return null
}

/**
 * Место группы - по всему ряду, а не по колонке под рукой: перед первой колонкой, середина
 * шапки которой правее руки (колонка с длинными цепочками шире своей шапки), иначе в конец
 * потока. Линия - посреди зазора между колонками, во всю высоту ряда.
 */
const groupPlace = (hit: DropHit, x: number): Placed | null => {
  if (hit.kind !== 'row') return null

  const index = hit.columns.findIndex((column) => x < column.head.left + column.head.width / 2)
  const at = index < 0 ? hit.columns.length : index
  const next = hit.columns[at]
  const prev = hit.columns[at - 1]
  const line = next
    ? next.rect.left - hit.gap / 2
    : prev
      ? prev.rect.left + prev.rect.width + hit.gap / 2
      : (hit.end?.left ?? hit.box.left)

  return {
    place: { kind: 'group', flowId: hit.flowId, beforeId: next?.id ?? null },
    mark: { axis: 'v', x: line, y: hit.box.top, length: hit.box.height },
  }
}

/** Место потока: выше или ниже потока под рукой. */
const flowPlace = (hit: DropHit, y: number, near: BoardNeighbours): Placed | null => {
  if (hit.kind !== 'flow') return null

  const before = y < hit.rect.top + hit.rect.height / 2

  return {
    place: { kind: 'flow', beforeId: before ? hit.id : (near.nextFlow.get(hit.id) ?? null) },
    mark: before ? above(hit.rect, hit.gap) : below(hit.rect, hit.gap),
  }
}

/** Место под рукой для того, что несут; null - сюда нельзя. */
export const placeOf = (
  hit: DropHit,
  x: number,
  y: number,
  source: DragSource,
  near: BoardNeighbours,
): Placed | null =>
  source.kind === 'card'
    ? cardPlace(hit, x, y, source, near)
    : source.kind === 'group'
      ? groupPlace(hit, x)
      : flowPlace(hit, y, near)

/**
 * Линия места в пределах видимой страницы: колонка за краем ряда или ряд выше шапки вида не
 * выносят её на соседние панели окна. Поперёк линии она прижимается к краю, вдоль - режется.
 */
export const clipMark = (mark: DropMark, view: Rect): DropMark => {
  const right = view.left + view.width
  const bottom = view.top + view.height

  if (mark.axis === 'v') {
    const top = Math.max(mark.y, view.top)

    return {
      ...mark,
      x: clamp(mark.x, view.left, right),
      y: top,
      length: Math.max(0, Math.min(mark.y + mark.length, bottom) - top),
    }
  }

  const left = Math.max(mark.x, view.left)

  return {
    ...mark,
    x: left,
    y: clamp(mark.y, view.top, bottom),
    length: Math.max(0, Math.min(mark.x + mark.length, right) - left),
  }
}

import type { TrackerOp, TrackerProject } from '@shared/tracker'

import type { BoardNeighbours } from '../tracker.utils'
import { findNode } from '../tracker.utils'
import type { Rect, DropHit, DropMark, DropPlace, DragSource } from './Board.types'

type Placed = { place: DropPlace; mark: DropMark }

const above = (rect: Rect): DropMark => ({
  axis: 'h',
  x: rect.left,
  y: rect.top,
  length: rect.width,
})
const below = (rect: Rect): DropMark => ({
  axis: 'h',
  x: rect.left,
  y: rect.top + rect.height,
  length: rect.width,
})
const leftOf = (rect: Rect): DropMark => ({
  axis: 'v',
  x: rect.left,
  y: rect.top,
  length: rect.height,
})
const rightOf = (rect: Rect): DropMark => ({
  axis: 'v',
  x: rect.left + rect.width,
  y: rect.top,
  length: rect.height,
})

/**
 * Место карточки под рукой. Над задачей - выше или ниже её в группе; над продолжением - левее
 * или правее в цепочке; над концом цепочки - продолжением в конец; над колонкой - задачей в
 * конец группы. Задачу не кладут в её же цепочку - такого места нет.
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
        mark: before ? leftOf(hit.rect) : rightOf(hit.rect),
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
      mark: before ? above(hit.rect) : below(hit.rect),
    }
  }

  if (hit.kind === 'chain') {
    if (own.has(hit.rootId)) return null

    return {
      place: { kind: 'card', groupId: hit.groupId, followUpOf: hit.rootId, beforeId: null },
      mark: leftOf(hit.rect),
    }
  }

  if (hit.kind === 'group' && hit.end) {
    return {
      place: { kind: 'card', groupId: hit.id, followUpOf: null, beforeId: null },
      mark: above(hit.end),
    }
  }

  return null
}

/**
 * Место группы: левее или правее колонки под рукой (половина - по шапке: колонка с длинными
 * цепочками шире своей шапки), в пустоте ряда - в конец потока.
 */
const groupPlace = (hit: DropHit, x: number, near: BoardNeighbours): Placed | null => {
  if (hit.kind === 'group') {
    const before = x < hit.head.left + hit.head.width / 2

    return {
      place: {
        kind: 'group',
        flowId: hit.flowId,
        beforeId: before ? hit.id : (near.nextGroup.get(hit.id) ?? null),
      },
      mark: before ? leftOf(hit.rect) : rightOf(hit.rect),
    }
  }

  if (hit.kind === 'row' && hit.end) {
    return { place: { kind: 'group', flowId: hit.flowId, beforeId: null }, mark: leftOf(hit.end) }
  }

  return null
}

/** Место потока: выше или ниже потока под рукой. */
const flowPlace = (hit: DropHit, y: number, near: BoardNeighbours): Placed | null => {
  if (hit.kind !== 'flow') return null

  const before = y < hit.rect.top + hit.rect.height / 2

  return {
    place: { kind: 'flow', beforeId: before ? hit.id : (near.nextFlow.get(hit.id) ?? null) },
    mark: before ? above(hit.rect) : below(hit.rect),
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
      ? groupPlace(hit, x, near)
      : flowPlace(hit, y, near)

/** Место, где несомое и так стоит: бросок туда ничего не меняет. */
export const isSamePlace = (
  source: DragSource,
  place: DropPlace,
  near: BoardNeighbours,
): boolean => {
  if (place.beforeId === source.id) return true

  if (place.kind === 'flow') return near.nextFlow.get(source.id) === place.beforeId
  if (place.kind === 'group')
    return (
      near.flowOf.get(source.id) === place.flowId &&
      near.nextGroup.get(source.id) === place.beforeId
    )

  const root = near.rootOf.get(source.id)
  const isTask = root === source.id

  if (place.followUpOf === null)
    return (
      isTask &&
      near.groupOf.get(source.id) === place.groupId &&
      near.nextTask.get(source.id) === place.beforeId
    )

  return !isTask && root === place.followUpOf && near.nextFollowUp.get(source.id) === place.beforeId
}

/** Список, где стоит несомое, и место «на шаг» в нём; null - дальше некуда. */
const stepIn = (ids: readonly string[], id: string, delta: -1 | 1) => {
  const index = ids.indexOf(id)
  const target = index + delta

  if (index < 0 || target < 0 || target >= ids.length) return undefined

  return delta < 0 ? (ids[target] ?? null) : (ids[target + 1] ?? null)
}

/** Место на шаг выше или ниже (левее или правее) - для клавиш и меню. */
export const stepPlace = (
  project: TrackerProject,
  source: DragSource,
  delta: -1 | 1,
): DropPlace | null => {
  if (source.kind === 'flow') {
    const beforeId = stepIn(
      project.flows.map((flow) => flow.id),
      source.id,
      delta,
    )

    return beforeId === undefined ? null : { kind: 'flow', beforeId }
  }

  for (const flow of project.flows) {
    const groupIds = flow.groups.map((group) => group.id)

    if (source.kind === 'group' && groupIds.includes(source.id)) {
      const beforeId = stepIn(groupIds, source.id, delta)

      return beforeId === undefined ? null : { kind: 'group', flowId: flow.id, beforeId }
    }

    for (const group of flow.groups) {
      const taskIds = group.tasks.map((task) => task.id)

      if (taskIds.includes(source.id)) {
        const beforeId = stepIn(taskIds, source.id, delta)

        return beforeId === undefined
          ? null
          : { kind: 'card', groupId: group.id, followUpOf: null, beforeId }
      }

      for (const task of group.tasks) {
        const chain = task.followUps.map((card) => card.id)

        if (!chain.includes(source.id)) continue

        const beforeId = stepIn(chain, source.id, delta)

        return beforeId === undefined
          ? null
          : { kind: 'card', groupId: group.id, followUpOf: task.id, beforeId }
      }
    }
  }

  return null
}

/** Правка доски для броска. */
export const opOf = (projectId: string, source: DragSource, place: DropPlace): TrackerOp =>
  place.kind === 'flow'
    ? { kind: 'flow.move', id: source.id, projectId, beforeId: place.beforeId }
    : place.kind === 'group'
      ? { kind: 'group.move', id: source.id, flowId: place.flowId, beforeId: place.beforeId }
      : {
          kind: 'card.move',
          id: source.id,
          groupId: place.groupId,
          followUpOf: place.followUpOf,
          beforeId: place.beforeId,
        }

/** Подпись призрака: заголовок того, что несут. */
export const titleOf = (project: TrackerProject, source: DragSource): string => {
  const node = findNode([project], source.id)

  switch (node?.kind) {
    case 'flow':
      return node.flow.title
    case 'group':
      return node.group.title
    case 'task':
    case 'followUp':
      return node.card.title
    default:
      return ''
  }
}

import type { TrackerOp, TrackerCardFields } from '@shared/tracker'

import { cardFieldsOf, TrackerError } from './tracker-fields'
import type { OpContext } from './tracker-guards'
import { own, openBranch } from './tracker-guards'
import { rankBefore, rankBetween } from './tracker-rank'
import type { TrackerRecord } from './tracker-records'
import { flagOf } from './tracker-records'
import type { Ranked, TrackerTree } from './tracker-tree'

type CardCreate = Extract<TrackerOp, { kind: 'card.create' }>
type CardMove = Extract<TrackerOp, { kind: 'card.move' }>

const EMPTY_CARD: Omit<TrackerCardFields, 'title'> = {
  subtitle: '',
  description: '',
  due: null,
  priority: 4,
  done: false,
  scenario: null,
}

/** Задача, в цепочку которой встаёт продолжение: живая задача своей доски не в архиве. */
const chainRoot = (ctx: OpContext, tree: TrackerTree, cardId: string): TrackerRecord => {
  own(ctx, tree, cardId, 'card')

  const root = tree.rootOf(cardId)

  if (!root || flagOf(root, 'deleted')) throw new TrackerError('badFollowUp')

  return openBranch(ctx, tree, root.id, 'card')
}

/**
 * Новая карточка: задача группы или продолжение задачи (followUpOf - задача или любое её
 * продолжение; без beforeId встаёт в конец цепочки).
 */
export const createCard = (ctx: OpContext, tree: TrackerTree, op: CardCreate): string => {
  const fields = { ...EMPTY_CARD, ...cardFieldsOf(op.fields) }
  const place = op.followUpOf
    ? (() => {
        const root = chainRoot(ctx, tree, op.followUpOf)

        return {
          parent: root.id,
          group: '',
          rank: rankBefore(tree.followUps(root.id), op.beforeId ?? null),
        }
      })()
    : (() => {
        openBranch(ctx, tree, op.groupId, 'group')

        return {
          parent: '',
          group: op.groupId,
          rank: rankBefore(tree.tasks(op.groupId), op.beforeId ?? null),
        }
      })()

  return ctx.book.create('card', {
    ...fields,
    ...place,
    doneAt: fields.done ? ctx.now : null,
  })
}

/** Правка полей карточки; отметка «сделано» ставит и снимает время выполнения. */
export const updateCard = (
  ctx: OpContext,
  card: TrackerRecord,
  raw: Partial<TrackerCardFields>,
) => {
  const fields = cardFieldsOf(raw)
  const doneAt =
    fields.done === undefined || fields.done === flagOf(card, 'done')
      ? undefined
      : fields.done
        ? ctx.now
        : null

  ctx.book.write(card.id, { ...fields, doneAt }, true)
}

/** Продолжения переносимой задачи встают за ней по порядку, перед следующей карточкой цепочки. */
const carryFollowUps = (
  ctx: OpContext,
  rootId: string,
  movedRank: string,
  next: Ranked | undefined,
  followUps: Ranked[],
) => {
  let after = movedRank

  for (const followUp of followUps) {
    const rank = rankBetween(after, next?.rank ?? null)

    ctx.book.write(followUp.id, { parent: rootId, group: '', rank }, true)
    after = rank
  }
}

/**
 * Перенос карточки. В группу - задачей (продолжения задачи едут с ней сами: они держатся за
 * задачу, а не за группу). В цепочку - продолжением; задача со своими продолжениями встаёт в
 * чужую цепочку вся, по порядку.
 */
export const moveCard = (ctx: OpContext, tree: TrackerTree, op: CardMove) => {
  const card = openBranch(ctx, tree, op.id, 'card')

  if (!op.followUpOf) {
    openBranch(ctx, tree, op.groupId, 'group')

    const list = tree.tasks(op.groupId).filter((one) => one.id !== card.id)

    ctx.book.write(
      card.id,
      { group: op.groupId, parent: '', rank: rankBefore(list, op.beforeId) },
      true,
    )

    return
  }

  const root = chainRoot(ctx, tree, op.followUpOf)

  if (root.id === card.id) throw new TrackerError('badFollowUp')

  const carried = tree.followUps(card.id)
  const chain = tree
    .followUps(root.id)
    .filter((one) => one.id !== card.id && !carried.some((followUp) => followUp.id === one.id))
  const rank = rankBefore(chain, op.beforeId)
  const next = chain.find((one) => one.rank > rank)

  ctx.book.write(card.id, { parent: root.id, group: '', rank }, true)
  carryFollowUps(ctx, root.id, rank, next, carried)
}

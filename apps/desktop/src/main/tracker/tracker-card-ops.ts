import type { TrackerOp, TrackerCardFields } from '@shared/tracker'

import { cardFieldsOf, TrackerError } from './tracker-fields'
import type { OpContext } from './tracker-guards'
import { own, openBranch, slotBefore } from './tracker-guards'
import { rankBetween } from './tracker-rank'
import type { TrackerRecord } from './tracker-records'
import { refOf, flagOf } from './tracker-records'
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

/**
 * Потолок карточки в байтах: запись уходит в облако одним шифром (потолок шифра - 96 КиБ base64,
 * около 72 КиБ текста). Лимиты полей считаются в знаках, а кириллица - два байта на знак: без этой
 * проверки карточка у предела полей молча осталась бы неотправленной.
 */
const MAX_CARD_BYTES = 60_000

const checkSize = (fields: Record<string, unknown>) => {
  if (Buffer.byteLength(JSON.stringify(fields)) > MAX_CARD_BYTES) throw new TrackerError('tooLong')
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

  checkSize(fields)
  const place = op.followUpOf
    ? (() => {
        const root = chainRoot(ctx, tree, op.followUpOf)

        // Продолжение помнит группу своей задачи: если цикл встречных переносов сделает его
        // корнем, ему есть где встать.
        return {
          parent: root.id,
          group: refOf(root, 'group') ?? '',
          rank: slotBefore(ctx, tree.followUps(root.id), op.beforeId ?? null),
        }
      })()
    : (() => {
        openBranch(ctx, tree, op.groupId, 'group')

        return {
          parent: '',
          group: op.groupId,
          rank: slotBefore(ctx, tree.tasks(op.groupId), op.beforeId ?? null),
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

  checkSize({
    ...Object.fromEntries(Object.entries(card.fields).map(([name, field]) => [name, field[0]])),
    ...fields,
  })

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
  root: { id: string; group: string },
  movedRank: string,
  next: Ranked | undefined,
  followUps: Ranked[],
) => {
  let after = movedRank

  for (const followUp of followUps) {
    const rank = rankBetween(after, next?.rank ?? null)

    ctx.book.write(followUp.id, { parent: root.id, group: root.group, rank }, true)
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
      { group: op.groupId, parent: '', rank: slotBefore(ctx, list, op.beforeId) },
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
  const rank = slotBefore(ctx, chain, op.beforeId)
  const next = chain.find((one) => one.rank > rank)

  const group = refOf(root, 'group') ?? ''

  ctx.book.write(card.id, { parent: root.id, group, rank }, true)
  carryFollowUps(ctx, { id: root.id, group }, rank, next, carried)
}

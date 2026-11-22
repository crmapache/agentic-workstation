import type { TrackerOp, TrackerDue, TrackerRepeat, TrackerRepeated } from '@shared/tracker'
import {
  dateOfDay,
  dayNumber,
  weekdayOf,
  dueForRule,
  nextRepeat,
  todayNumber,
} from '@shared/tracker-repeat'

import type { TrackerBook } from './tracker-book'
import { flagOf } from './tracker-records'
import type { TrackerRecord } from './tracker-records'
import type { TrackerTree } from './tracker-tree'
import { dueValue, repeatValue } from './tracker-view'

/**
 * Срок и повтор карточки вместе (ADR 0103): повтор держится за срок, а отметка «сделано» у
 * повторяющейся карточки сдвигает срок, а не гасит её.
 */

type Timing = { due: TrackerDue | null; repeat: TrackerRepeat | null }

/** Только присланное: правка без ключа поле не трогает. */
const given = (timing: Partial<Timing>): Partial<Timing> => ({
  ...(timing.due !== undefined && { due: timing.due }),
  ...(timing.repeat !== undefined && { repeat: timing.repeat }),
})

/** Правило с началом: пустое начало - день срока; недельный повтор без дней - день начала. */
const anchored = (repeat: TrackerRepeat, date: string): TrackerRepeat => {
  const start = repeat.start || date
  const day = dayNumber(start)

  return {
    ...repeat,
    start,
    weekdays:
      repeat.unit === 'week' && !repeat.fromDone && repeat.weekdays.length === 0 && day !== null
        ? [weekdayOf(day)]
        : repeat.weekdays,
  }
}

/**
 * Что записать в срок и повтор правкой (undefined - не трогать). Снятый срок снимает и повтор: без
 * срока повторять нечего. Новое правило без срока ставит срок на свой первый день от сегодня;
 * новое правило, которому нынешний срок не подходит («каждый понедельник» у карточки на среду),
 * переносит срок на свой ближайший день, как в Todoist. Срок, присланный той же правкой, - как
 * прислан: человек выбрал его сам.
 */
export const timingOf = (
  current: Timing,
  incoming: Partial<Timing>,
  now: number,
): Partial<Timing> => {
  const rule = incoming.repeat

  if (!rule) {
    const clearsRule = incoming.due === null && rule === undefined && current.repeat !== null

    return clearsRule ? { due: null, repeat: null } : given(incoming)
  }

  const due = incoming.due === undefined ? current.due : incoming.due
  const today = dateOfDay(todayNumber(now))
  const repeat = anchored(rule, due?.date ?? today)

  // Срок, присланный той же правкой, человек выбрал сам - его не двигаем.
  const placed = due && incoming.due !== undefined ? due : dueForRule(repeat, due, today)

  return { ...given(incoming), repeat, ...(placed !== due && { due: placed }) }
}

/**
 * Отметить карточку сделанной. Повторяющаяся не гаснет: срок уходит на следующий день правила,
 * а сделанные продолжения задачи снова открыты - их черёд в новом круге. sentAt - когда её
 * отправили прогоном, если отмечает очередь (nextRepeat); сделанная очередью закрыта на правку
 * (doneByRun, ADR 0110). Ответ - что вернёт «Undo»; null - обычная карточка, она просто сделана.
 */
export const completeCard = (
  book: TrackerBook,
  tree: TrackerTree,
  card: TrackerRecord,
  now: number,
  sentAt: number | null = null,
): TrackerRepeated | null => {
  const repeat = repeatValue(card)
  const due = dueValue(card)

  if (!repeat || !due) {
    book.write(card.id, { done: true, doneAt: now, doneByRun: sentAt !== null }, true)

    return null
  }

  const next = nextRepeat(repeat, due, now, sentAt)
  const reopened = tree
    .followUps(card.id)
    .filter((one) => flagOf(one.record, 'done'))
    .map((one) => one.id)

  // Карточка, сделанная до того, как у неё появился повтор, снова открыта: дальше её круг.
  book.write(card.id, { due: next, done: false, doneAt: null, doneByRun: false }, true)

  for (const id of reopened) book.write(id, { done: false, doneAt: null, doneByRun: false }, true)

  const undo: TrackerOp[] = [
    { kind: 'card.update', id: card.id, fields: { due } },
    ...reopened.map((id): TrackerOp => ({ kind: 'card.update', id, fields: { done: true } })),
  ]

  return { cardId: card.id, due: next, undo }
}

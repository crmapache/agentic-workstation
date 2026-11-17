import {
  cleanHours,
  lastClosing,
  nextClosing,
  nextOpening,
  isWorkingTime,
} from '@shared/queue-hours'
import type { QueueHours, ScenarioQueue } from '@shared/scenario-queues'

/**
 * Рабочие часы очереди (ADR 0074) - чистыми правилами, как остальная очередь: когда ей уснуть,
 * проснуться, что помнить. Исполняет их QueueHoursKeeper: ставит прогон на паузу и снимает.
 *
 * Сон - одна дремота на промежуток между окнами. Уснув, очередь не усыпляет себя второй раз,
 * пока окно снова не откроется и не закроется: человек ночью снял прогон с паузы - значит, так
 * и надо, через полминуты часы его обратно не остановят.
 */

/** Что сделать с очередью по часам сейчас. */
export type NapMove =
  | { kind: 'stay' }
  /** Окно кончилось, а очередь ещё не спала с его конца. */
  | { kind: 'sleep'; until: number }
  /** Окно идёт (или часов больше нет), а очередь спит. */
  | { kind: 'wake' }
  /** Спит, но проснётся в другое время: поправили часы, машина в другом поясе. */
  | { kind: 'retime'; until: number }

const STAY: NapMove = { kind: 'stay' }

export const napMove = (queue: ScenarioQueue, now: number): NapMove => {
  const { hours, nap } = queue

  if (queue.closedAt > 0 || !hours || hours.days.length === 0 || isWorkingTime(hours, now)) {
    return nap ? { kind: 'wake' } : STAY
  }

  const until = nextOpening(hours, now)

  if (!nap || nap.at < lastClosing(hours, now)) return { kind: 'sleep', until }

  return nap.until === until ? STAY : { kind: 'retime', until }
}

/**
 * Уснуть. pausedRunId - прогон, который часы только что поставили на паузу. Не ставили ничего,
 * а прежняя дремота помнит прогон, оборванный выходом IDE, - он остаётся за ней: его продолжат,
 * когда окно откроется.
 */
export const fallAsleep = (
  queue: ScenarioQueue,
  now: number,
  until: number,
  pausedRunId: string,
): ScenarioQueue => ({
  ...queue,
  nap: { at: now, until, runId: pausedRunId || queue.nap?.runId || '' },
})

export const retimeNap = (queue: ScenarioQueue, until: number): ScenarioQueue =>
  queue.nap ? { ...queue, nap: { ...queue.nap, until } } : queue

export const wakeUp = (queue: ScenarioQueue): ScenarioQueue =>
  queue.nap ? { ...queue, nap: null } : queue

/**
 * Прогон дремоты больше не за часами: человек сам поставил или снял паузу, прогон кончился.
 * Проснувшись, очередь его не тронет.
 */
export const forgetNapRun = (queue: ScenarioQueue, runId: string): ScenarioQueue =>
  queue.nap && queue.nap.runId === runId ? { ...queue, nap: { ...queue.nap, runId: '' } } : queue

/**
 * Прогон дремоты не продолжился, когда окно открылось (worktree удалён, провайдера нет): очередь
 * встаёт так же, как после выхода IDE посреди прогона, - решает человек. Ждущих нет - не встаёт.
 */
export const missedWake = (queue: ScenarioQueue, runId: string, now: number): ScenarioQueue => {
  const item = queue.items.find((one) => one.runId === runId)
  const waiting = queue.items.some((one) => one.state === 'waiting')

  return item && waiting && !queue.hold
    ? { ...queue, hold: { reason: 'interrupted', itemId: item.id, at: now } }
    : queue
}

/** Новые часы; null - работать в любое время. Сон пересчитает следующий шаг очереди. */
export const setHours = (queue: ScenarioQueue, hours: QueueHours | null): ScenarioQueue => ({
  ...queue,
  hours: hours ? cleanHours(hours) : null,
})

/**
 * Очередь отдыхает: спит или окно уже кончилось, а уснуть она ещё не успела (часы бьют раз в
 * полминуты). Пока отдыхает, следующий сценарий не стартует.
 */
export const isResting = (queue: ScenarioQueue, now: number): boolean =>
  queue.nap !== null || (queue.hours !== null && !isWorkingTime(queue.hours, now))

/** Ближайший момент, когда часам этой очереди есть что делать; 0 - не будет. */
export const nextHoursMove = (queue: ScenarioQueue, now: number): number => {
  if (queue.closedAt > 0 || !queue.hours) return 0
  if (queue.nap) return queue.nap.until

  return nextClosing(queue.hours, now) || nextOpening(queue.hours, now)
}

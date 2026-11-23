import { DAY_MS } from '@shared/time-units'

/** Период синка [from, to), мс UTC. */
export type SyncWindow = { from: number; to: number }

/** Прямой источник читается на неделю назад (вспомнить вчерашний звонок) и на два месяца вперёд. */
const DIRECT_BACK_DAYS = 7
const DIRECT_AHEAD_DAYS = 60

/** Снимок держит месяц назад и три вперёд: старее и дальше на сетку не смотрят. */
const KEEP_BACK_DAYS = 30
const KEEP_AHEAD_DAYS = 90

/** Местная полночь дня момента now. */
export const localMidnight = (now: number): number => {
  const date = new Date(now)

  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Местная полночь через days дней: сутки при переводе часов - 23 и 25 часов, считаем календарём. */
export const addLocalDays = (midnight: number, days: number): number => {
  const date = new Date(midnight)

  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime()
}

/** Окно прямого источника (Google, ICS). */
export const directWindow = (now: number): SyncWindow => {
  const today = localMidnight(now)

  return {
    from: addLocalDays(today, -DIRECT_BACK_DAYS),
    to: addLocalDays(today, DIRECT_AHEAD_DAYS),
  }
}

/** Окно чтения ИИ: с сегодняшнего дня на weeks недель. */
export const aiWindow = (now: number, weeks: number): SyncWindow => {
  const today = localMidnight(now)

  return { from: today, to: addLocalDays(today, weeks * 7) }
}

/** Что держит снимок: старее и дальше этого события выбрасываются при каждой записи. */
export const keptWindow = (now: number): SyncWindow => {
  const today = localMidnight(now)

  return { from: addLocalDays(today, -KEEP_BACK_DAYS), to: addLocalDays(today, KEEP_AHEAD_DAYS) }
}

/** Ключ события в своём источнике. */
export const eventKey = (sourceId: string, uid: string, recurrenceId: string): string =>
  `${sourceId}|${uid}|${recurrenceId}`

/**
 * Даты события на весь день: конец не включён; нет конца или он не позже начала - один день.
 */
export const allDayRange = (from: string, to: string | null): { from: string; to: string } => {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = to ? Date.parse(`${to}T00:00:00Z`) : Number.NaN

  return {
    from,
    to: end > start ? (to ?? from) : new Date(start + DAY_MS).toISOString().slice(0, 10),
  }
}

/** Задевает ли отрезок [start, end) окно. */
export const touches = (window: SyncWindow, start: number, end: number): boolean =>
  end > window.from && start < window.to

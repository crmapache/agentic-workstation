import type { StatsRange, StatsStreaks, StatsWorkSessions } from '@shared/statistics'
import { DAY_MS, MINUTE_MS } from '@shared/time-units'

/** Отрезок времени [start, end) в мс. */
export type Interval = { start: number; end: number }

/** Объединение отрезков: перекрытые и стыкующиеся сливаются, ответ упорядочен. */
export const unionIntervals = (intervals: readonly Interval[]): Interval[] => {
  const merged: Interval[] = []

  for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
    if (interval.end <= interval.start) continue

    const last = merged.at(-1)

    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end)
    else merged.push({ ...interval })
  }

  return merged
}

export const totalLength = (intervals: readonly Interval[]): number =>
  intervals.reduce((sum, interval) => sum + (interval.end - interval.start), 0)

/** Отрезок, обрезанный периодом; null - вне периода. */
export const clip = (interval: Interval, from: number, to: number): Interval | null => {
  const start = Math.max(interval.start, from)
  const end = Math.min(interval.end, to)

  return end > start ? { start, end } : null
}

/** Минуты эпохи (упорядоченные, без повторов) - отрезками: соседние минуты сливаются. */
export const minuteIntervals = (minutes: readonly number[]): Interval[] => {
  const intervals: Interval[] = []

  for (const minute of minutes) {
    const start = minute * MINUTE_MS
    const last = intervals.at(-1)

    if (last && last.end === start) last.end = start + MINUTE_MS
    else intervals.push({ start, end: start + MINUTE_MS })
  }

  return intervals
}

/**
 * Сколько времени из a лежит вне b (оба - объединённые и упорядоченные): «агенты работали
 * без тебя» - настенное время агентов минус минуты присутствия.
 */
export const lengthOutside = (a: readonly Interval[], b: readonly Interval[]): number => {
  let outside = 0
  let index = 0

  for (const interval of a) {
    let cursor = interval.start

    while (index < b.length && (b[index]?.end ?? 0) <= cursor) index += 1

    for (let probe = index; probe < b.length && cursor < interval.end; probe += 1) {
      const cover = b[probe]

      if (!cover || cover.start >= interval.end) break
      if (cover.start > cursor) outside += cover.start - cursor

      cursor = Math.max(cursor, cover.end)
    }

    if (cursor < interval.end) outside += interval.end - cursor
  }

  return outside
}

/**
 * Рабочие сессии: минуты присутствия (упорядоченные, без повторов), разделённые паузой
 * больше gapMinutes. Длина сессии - от первой её минуты до последней включительно.
 */
export const workSessions = (minutes: readonly number[], gapMinutes: number): StatsWorkSessions => {
  const lengths: number[] = []
  let first: number | null = null
  let last = 0

  for (const minute of minutes) {
    if (first !== null && minute - last > gapMinutes) {
      lengths.push(last - first + 1)
      first = null
    }

    first ??= minute
    last = minute
  }

  if (first !== null) lengths.push(last - first + 1)

  const total = lengths.reduce((sum, length) => sum + length, 0)

  return {
    count: lengths.length,
    longestMinutes: lengths.length > 0 ? Math.max(...lengths) : 0,
    averageMinutes: lengths.length > 0 ? total / lengths.length : 0,
  }
}

/**
 * Номер местного календарного дня: полночь по Гринвичу той же даты, в днях. Не зависит от
 * перевода часов - сутки с ним бывают по 23 и 25 часов, а номера идут подряд.
 */
export const localDayIndex = (ms: number): number => {
  const date = new Date(ms)

  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS)
}

/** Местная полночь дня по его номеру. */
export const dayIndexStart = (index: number): number => {
  const utc = new Date(index * DAY_MS)

  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()).getTime()
}

/** ГГГГ-ММ-ДД дня по его номеру. */
export const dayIndexLabel = (index: number): string =>
  new Date(index * DAY_MS).toISOString().slice(0, 10)

/** Серии активных дней: текущая (до вчера, если сегодня ещё пусто) и лучшая. */
export const streaksOf = (activeDays: ReadonlySet<number>, today: number): StatsStreaks => {
  const activeToday = activeDays.has(today)
  let current = 0

  for (let day = activeToday ? today : today - 1; activeDays.has(day); day -= 1) current += 1

  let best = 0
  let run = 0
  let previous = Number.NaN

  for (const day of [...activeDays].sort((a, b) => a - b)) {
    run = day === previous + 1 ? run + 1 : 1
    best = Math.max(best, run)
    previous = day
  }

  return { current, best, activeToday }
}

/** Лучшее окно из span подряд значений по кругу (неделя, сутки); null - всё нули. */
export const bestWindow = (values: readonly number[], span: number): StatsRange | null => {
  let best = 0
  let from = -1

  for (let start = 0; start < values.length; start += 1) {
    let sum = 0

    for (let offset = 0; offset < span; offset += 1) {
      sum += values[(start + offset) % values.length] ?? 0
    }

    if (sum > best) {
      best = sum
      from = start
    }
  }

  return from === -1 ? null : { from, to: (from + span) % values.length }
}

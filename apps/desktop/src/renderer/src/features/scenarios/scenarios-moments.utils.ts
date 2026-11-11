import { clockLabel, daysBetween } from '../../lib/dates.utils'

/**
 * Когда прогон начат и кончился - словами таблицы (moments.ts в ACC): сегодня и вчера - часом,
 * раньше - датой с часом. У законченного прогона почти всегда «5/5», а спрашивают, когда ночь
 * кончилась.
 */

const dayAndHour = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Слова для сегодня и вчера - из i18n. */
export type MomentWords = {
  todayAt: (clock: string) => string
  yesterdayAt: (clock: string) => string
}

export const momentLabel = (at: number, words: MomentWords, now: number): string => {
  const away = daysBetween(now, at)

  if (away === 0) return words.todayAt(clockLabel(at))
  if (away === -1) return words.yesterdayAt(clockLabel(at))

  return dayAndHour.format(new Date(at))
}

/** Конец - часом без дня, если день тот же, что у начала. */
export const endedLabel = (
  startedAt: number,
  finishedAt: number,
  words: MomentWords,
  now: number,
): string =>
  daysBetween(startedAt, finishedAt) === 0
    ? clockLabel(finishedAt)
    : momentLabel(finishedAt, words, now)

/** Полная дата и время - «started 10/19/2026, 10:11:31 PM» в шапке прогона. */
export const startedLabel = (at: number): string => new Date(at).toLocaleString('en')

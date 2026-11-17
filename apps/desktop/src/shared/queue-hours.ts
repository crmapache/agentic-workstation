import type { QueueHours } from './scenario-queues'

/**
 * Рабочие часы очереди (ADR 0074) - арифметикой: идёт ли сейчас окно, когда оно откроется и
 * закроется. Одна на главный процесс (он будит и усыпляет очередь) и окно (оно говорит «resumes
 * Tue 10:00» до сохранения). Время - местное время машины: часы человека, а не UTC.
 */

/** Минут в сутках: начало и конец окна - минуты от полуночи, меньше этого. */
export const DAY_MINUTES = 24 * 60

/** На сколько дней в обе стороны искать окна: дни недели повторяются за семь. */
const REACH_DAYS = 8

/** Окна, сцепленные встык (сутки подряд), - сколько звеньев пройти до настоящего конца. */
const CHAIN_LIMIT = 16

type Window = { start: number; end: number }

/** Длина окна в минутах: конец раньше начала - окно через полночь; равны - сутки целиком. */
export const spanMinutes = (hours: QueueHours): number =>
  (hours.to - hours.from + DAY_MINUTES) % DAY_MINUTES || DAY_MINUTES

/** Окно на все семь дней по суткам - очередь не спит никогда, и закрываться окну некогда. */
export const isAlwaysOn = (hours: QueueHours): boolean =>
  hours.days.length === 7 && spanMinutes(hours) === DAY_MINUTES

/** День недели момента по ISO: 1 - понедельник, 7 - воскресенье. */
const isoWeekday = (day: Date): number => day.getDay() || 7

/**
 * Окна вокруг момента: по одному на каждый выбранный день недели. Начало и конец собираются
 * календарём из местных полей, а не прибавлением миллисекунд, - тогда окно «10:00-19:00»
 * остаётся им и в день перевода часов.
 */
const windowsAround = (hours: QueueHours, at: number): Window[] => {
  const base = new Date(at)
  const span = spanMinutes(hours)
  const windows: Window[] = []

  for (let offset = -REACH_DAYS; offset <= REACH_DAYS; offset += 1) {
    const year = base.getFullYear()
    const month = base.getMonth()
    const date = base.getDate() + offset
    const day = new Date(year, month, date)

    if (!hours.days.includes(isoWeekday(day))) continue

    windows.push({
      start: new Date(year, month, date, 0, hours.from).getTime(),
      end: new Date(year, month, date, 0, hours.from + span).getTime(),
    })
  }

  return windows
}

/** Идёт ли рабочее окно в момент at. Дней не выбрано - не идёт никогда. */
export const isWorkingTime = (hours: QueueHours, at: number): boolean =>
  windowsAround(hours, at).some((window) => window.start <= at && at < window.end)

/** Когда откроется ближайшее окно после at; 0 - дней не выбрано. */
export const nextOpening = (hours: QueueHours, at: number): number =>
  isAlwaysOn(hours) ? 0 : (windowsAround(hours, at).find((window) => window.start > at)?.start ?? 0)

/** Когда закрылось последнее окно до at (включительно); 0 - не было ни одного. */
export const lastClosing = (hours: QueueHours, at: number): number =>
  windowsAround(hours, at)
    .filter((window) => window.end <= at)
    .reduce((latest, window) => Math.max(latest, window.end), 0)

/**
 * Когда кончится идущее окно; окна встык (суточные дни подряд) - одно окно. 0 - сейчас окна
 * нет или оно не кончается никогда.
 */
export const nextClosing = (hours: QueueHours, at: number): number => {
  if (isAlwaysOn(hours)) return 0

  const windows = windowsAround(hours, at)
  let end = windows.find((window) => window.start <= at && at < window.end)?.end ?? 0

  for (let link = 0; end > 0 && link < CHAIN_LIMIT; link += 1) {
    const joined = windows.find((window) => window.start <= end && end < window.end)

    if (!joined) break

    end = joined.end
  }

  return end
}

/** Часы в порядке: минуты в пределах суток, дни - по разу, по порядку, только 1-7. */
export const cleanHours = (hours: QueueHours): QueueHours => {
  const minute = (value: number) => Math.min(Math.max(Math.round(value), 0), DAY_MINUTES - 1) || 0

  return {
    from: minute(hours.from),
    to: minute(hours.to),
    days: [...new Set(hours.days)]
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
      .sort((left, right) => left - right),
  }
}

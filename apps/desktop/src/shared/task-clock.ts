import type { Task, TaskSchedule } from './tasks'
import { MINUTE_MS } from './time-units'

/**
 * Часы заданий: ближайший срок по ритму и что делать со сроком, который пришёл. Время - местное
 * время машины, сутки и месяцы прибавляются календарём: переход на летнее время не сдвигает
 * «в девять утра» на восемь.
 */

/** Несколько минут опоздания - это разбуженный ноутбук и такт часов, а не пропуск. */
export const GRACE_MS = 5 * MINUTE_MS

const DAY_MINUTES = 24 * 60

const clampMinutes = (at: number) =>
  Math.min(Math.max(Math.round(Number.isFinite(at) ? at : 0), 0), DAY_MINUTES - 1)

/** Тот же день в hh:mm. */
const atTime = (day: Date, minutes: number): Date => {
  const moment = new Date(day)

  moment.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)

  return moment
}

/** Следующий календарный день в hh:mm. */
const nextDay = (day: Date, minutes: number): Date => {
  const moment = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)

  return atTime(moment, minutes)
}

const isoWeekday = (day: Date) => day.getDay() || 7

const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

/** День месяца, который встаёт в этом месяце: 31-е в апреле - 30-е. */
const monthMoment = (year: number, month: number, monthDay: number, minutes: number): Date => {
  const day = Math.min(Math.max(Math.round(monthDay), 1), daysInMonth(year, month))

  return atTime(new Date(year, month, day), minutes)
}

/** YYYY-MM-DD в местную дату; null - не дата. */
export const parseDay = (text: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)

  if (!match) return null

  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
  const date = new Date(year, month, day)

  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : null
}

/** Ближайший срок строго после from (мс); 0 - срока нет (вручную, разовый в прошлом). */
export const nextDue = (schedule: TaskSchedule, from: number): number => {
  const minutes = clampMinutes(schedule.at)
  const now = new Date(from)

  switch (schedule.repeat) {
    case 'manual':
      return 0
    case 'once': {
      const day = parseDay(schedule.date)
      const moment = day ? atTime(day, minutes).getTime() : 0

      return moment > from ? moment : 0
    }
    case 'hourly': {
      const moment = new Date(now)

      moment.setMinutes(minutes % 60, 0, 0)

      return moment.getTime() > from ? moment.getTime() : moment.getTime() + 60 * MINUTE_MS
    }
    case 'daily': {
      const today = atTime(now, minutes)

      return (today.getTime() > from ? today : nextDay(now, minutes)).getTime()
    }
    case 'weekly': {
      const days = new Set(schedule.days.filter((day) => day >= 1 && day <= 7))
      let moment = atTime(now, minutes)

      if (moment.getTime() <= from) moment = nextDay(now, minutes)

      // Пустой набор дней - это каждый день: неделя без дней не пустила бы задание никогда.
      for (let step = 0; step < 8 && days.size > 0; step += 1) {
        if (days.has(isoWeekday(moment))) break

        moment = nextDay(moment, minutes)
      }

      return moment.getTime()
    }
    case 'monthly': {
      const here = monthMoment(now.getFullYear(), now.getMonth(), schedule.monthDay, minutes)

      if (here.getTime() > from) return here.getTime()

      return monthMoment(
        now.getFullYear(),
        now.getMonth() + 1,
        schedule.monthDay,
        minutes,
      ).getTime()
    }
  }
}

/**
 * Что делать со сроком сейчас. run - срок пришёл; catchUp - прошёл давно (IDE была закрыта,
 * машина спала), а задание наверстывает пропуск одним прогоном; missed - прошёл давно и не
 * наверстывается; wait - не пора.
 */
export type DueVerdict = 'wait' | 'run' | 'catchUp' | 'missed'

export const dueVerdict = (
  task: Pick<Task, 'enabled' | 'nextAt' | 'catchUp'>,
  now: number,
): DueVerdict => {
  if (!task.enabled || task.nextAt === 0 || task.nextAt > now) return 'wait'
  if (task.nextAt >= now - GRACE_MS) return 'run'

  return task.catchUp ? 'catchUp' : 'missed'
}

/**
 * Срок после того, как пришедший взят: следующий от «сейчас», а не от прошлого срока - пять
 * пропущенных часов не поднимают пять прогонов подряд.
 */
export const afterDue = (task: Pick<Task, 'schedule'>, now: number): number =>
  nextDue(task.schedule, now)

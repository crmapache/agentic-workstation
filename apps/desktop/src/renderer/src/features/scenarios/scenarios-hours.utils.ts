import type { Scenario, ScenarioRepeat, ScenarioSchedule } from '@shared/scenarios'

/**
 * Часы на экране (schedule.ts, timetable.ts, due.ts в ACC): ближайший срок формы, расписание
 * по дням - таймплан, а не список: дни заголовками, час в жёлобе, одна строка на договорённость.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Минуты в меню часа - по пять: это договор с утром, а не будильник. */
export const MINUTE_STEP = 5

/** Час, как его держит форма: минуты от полуночи, ритм и день недели (1 - понедельник). */
export type ScheduledHour = { at: number; repeat: ScenarioRepeat; weekday: number }

export const HOURS: readonly number[] = Array.from({ length: 24 }, (_, hour) => hour)

export const MINUTES: readonly number[] = Array.from(
  { length: 60 / MINUTE_STEP },
  (_, step) => step * MINUTE_STEP,
)

export const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 7]

export const pad2 = (value: number): string => String(value).padStart(2, '0')

/** «08:30» из минут от полуночи. */
export const clockLabel = (minutes: number): string => {
  const safe = Math.min(Math.max(Math.round(minutes), 0), 24 * 60 - 1)

  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`
}

/** Форма открывается на «примерно через час», вверх до пяти минут: не сию секунду, а как доделаю. */
export const defaultHour = (now: number): number => {
  const then = new Date(now)
  const minutes = then.getHours() * 60 + then.getMinutes() + 60

  return (Math.ceil(minutes / MINUTE_STEP) * MINUTE_STEP) % (24 * 60)
}

/** Ближайший срок часа после from - чтобы форма сказала «next Mon 23:15, in 1h». */
export const nextDue = (hour: ScheduledHour, from: number): number => {
  const minutes = Math.min(Math.max(Math.round(hour.at), 0), 24 * 60 - 1)
  const at = (moment: number) => {
    const day = new Date(moment)

    day.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)

    return day
  }
  let day = at(from)

  if (day.getTime() <= from) day = at(day.getTime() + DAY_MS)

  for (let step = 0; step < 8; step += 1) {
    const weekday = day.getDay() || 7
    const skip =
      (hour.repeat === 'weekdays' && weekday >= 6) ||
      (hour.repeat === 'weekly' && weekday !== hour.weekday)

    if (!skip) break

    day = at(day.getTime() + DAY_MS)
  }

  return day.getTime()
}

/** День недели момента по ISO: 1 - понедельник, 7 - воскресенье (как weekday расписания). */
export const isoWeekday = (at: number): number => new Date(at).getDay() || 7

/** Имя дня недели в локали (1 - понедельник). */
export const weekdayName = (weekday: number, style: 'short' | 'long' = 'short'): string =>
  new Intl.DateTimeFormat('en', { weekday: style, timeZone: 'UTC' }).format(
    new Date(Date.UTC(2025, 0, 5 + Math.min(Math.max(weekday, 1), 7))),
  )

/** «Mon 23:15» - когда сработает. */
export const whenLabel = (at: number): string =>
  new Intl.DateTimeFormat('en', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(at))

/** Сколько ждать: «5m», «3h», «2d»; меньше минуты - now. */
export const countdown = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000)

  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)

  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}

/** Порядок: пропущенные разовые сверху, потом по ближайшему сроку, потом по часу. */
export const orderedSchedules = (schedules: readonly ScenarioSchedule[]): ScenarioSchedule[] =>
  [...schedules].sort((left, right) => {
    const missed =
      Number(right.missedAt > 0 && right.nextAt === 0) -
      Number(left.missedAt > 0 && left.nextAt === 0)

    if (missed !== 0) return missed
    if (left.nextAt !== right.nextAt) {
      return (left.nextAt || Number.MAX_SAFE_INTEGER) - (right.nextAt || Number.MAX_SAFE_INTEGER)
    }

    return left.at - right.at
  })

/** Часы одного сценария. */
export const schedulesOf = (
  schedules: readonly ScenarioSchedule[],
  scenario: Pick<Scenario, 'id' | 'scope'>,
): ScenarioSchedule[] =>
  orderedSchedules(
    schedules.filter((one) => one.scenarioId === scenario.id && one.scope === scenario.scope),
  )

export const dayKey = (at: number): string => {
  const date = new Date(at)

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Сколько календарных дней от from до to (сегодня - 0, завтра - 1). */
export const daysBetween = (from: number, to: number): number => {
  const start = new Date(from)
  const end = new Date(to)

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  return Math.round((end.getTime() - start.getTime()) / DAY_MS)
}

export type TimetableRow = {
  schedule: ScenarioSchedule
  scenario: Scenario | null
  at: number
  missed: boolean
}

export type TimetableDay = { key: string; at: number; awayInDays: number; rows: TimetableRow[] }

export type Timetable = { missed: TimetableRow[]; days: TimetableDay[]; count: number }

/**
 * Расписание по дням: место строке даёт ближайший срок. Исключение - разовый час, прошедший
 * при закрытой IDE: без своей строки наверху он исчез бы бесследно.
 */
export const timetableOf = (
  schedules: readonly ScenarioSchedule[],
  scenarios: readonly Scenario[],
  now: number,
): Timetable => {
  const missed: TimetableRow[] = []
  const days: TimetableDay[] = []

  for (const schedule of orderedSchedules(schedules)) {
    const scenario =
      scenarios.find((one) => one.id === schedule.scenarioId && one.scope === schedule.scope) ??
      null

    if (schedule.nextAt <= 0) {
      if (schedule.missedAt > 0)
        missed.push({ schedule, scenario, at: schedule.missedAt, missed: true })
      continue
    }

    const row = { schedule, scenario, at: schedule.nextAt, missed: false }
    const key = dayKey(schedule.nextAt)
    const day = days.find((one) => one.key === key)

    if (day) day.rows.push(row)
    else
      days.push({
        key,
        at: schedule.nextAt,
        awayInDays: daysBetween(now, schedule.nextAt),
        rows: [row],
      })
  }

  return {
    missed,
    days,
    count: missed.length + days.reduce((sum, day) => sum + day.rows.length, 0),
  }
}

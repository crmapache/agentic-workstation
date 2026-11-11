import type { Scenario, ScenarioSchedule } from '@shared/scenarios'
import { DAY_MS, MINUTE_MS } from '@shared/time-units'

/**
 * Часы отложенных запусков (ScheduleClock и Schedules в ACC): когда следующий срок, созрел ли
 * час, пропущен ли. Пропущенное не наверстывается никогда: круг работ, поднятый через шесть
 * часов после своего часа только потому, что кто-то открыл IDE, - сюрприз, которого не просили.
 */

/** Несколько минут опоздания - это разбуженный ноутбук, а не пропущенная ночь. */
export const GRACE_MS = 5 * MINUTE_MS

/** Ближайший срок после from (мс) по местному времени машины. */
export const nextDue = (
  hour: Pick<ScenarioSchedule, 'at' | 'repeat' | 'weekday'>,
  from: number,
): number => {
  const minutes = Math.min(Math.max(Math.round(hour.at), 0), 24 * 60 - 1)
  const at = (moment: number) => {
    const day = new Date(moment)

    day.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)

    return day
  }
  let day = at(from)

  if (day.getTime() <= from) day = at(day.getTime() + DAY_MS)

  const wanted = Math.min(Math.max(Math.round(hour.weekday), 1), 7)
  const isoDay = (date: Date) => date.getDay() || 7

  for (let step = 0; step < 8; step += 1) {
    const weekday = isoDay(day)
    const skip =
      (hour.repeat === 'weekdays' && weekday >= 6) ||
      (hour.repeat === 'weekly' && weekday !== wanted)

    if (!skip) break

    day = at(day.getTime() + DAY_MS)
  }

  return day.getTime()
}

/** Созрел: срок прошёл, но не дальше запаса. */
export const isDue = (schedule: ScenarioSchedule, now: number): boolean =>
  schedule.nextAt > 0 && schedule.nextAt <= now && schedule.nextAt >= now - GRACE_MS

/** Пропущен: срок прошёл давно (IDE была закрыта, машина спала). */
export const isMissed = (schedule: ScenarioSchedule, now: number): boolean =>
  schedule.nextAt > 0 && schedule.nextAt < now - GRACE_MS

/** Час взят: разовый теряет срок, повторный получает следующий. Это и есть претензия на час. */
export const armed = (schedule: ScenarioSchedule, firedAt: number): ScenarioSchedule =>
  schedule.repeat === 'once'
    ? { ...schedule, nextAt: 0 }
    : { ...schedule, nextAt: nextDue(schedule, Math.max(firedAt, schedule.nextAt)) }

/**
 * Итог часа: сработавший разовый удаляется (null), отказ остаётся с отметкой о пропуске;
 * первый сработавший час снимает отметку.
 */
export const settled = (
  schedule: ScenarioSchedule,
  due: number,
  firedAt: number,
  ran: boolean,
): ScenarioSchedule | null => {
  if (ran && schedule.repeat === 'once') return null

  return { ...schedule, lastAt: ran ? firedAt : schedule.lastAt, missedAt: ran ? 0 : due }
}

/** Новая запись (свой id) или правка существующей по id. */
export const putSchedule = (
  list: ScenarioSchedule[],
  schedule: ScenarioSchedule,
  freshId: () => string,
): ScenarioSchedule[] => {
  const at = schedule.id ? list.findIndex((one) => one.id === schedule.id) : -1

  if (at < 0) return [...list, { ...schedule, id: freshId() }]

  return list.map((one, index) => (index === at ? schedule : one))
}

/**
 * Занять час, если срок всё ещё тот, что видели (CAS по nextAt): десять взглядов часов за
 * пять минут запаса подняли бы десять прогонов.
 */
export const claimHour = (
  list: ScenarioSchedule[],
  id: string,
  expected: number,
  next: ScenarioSchedule,
): ScenarioSchedule[] | null => {
  const at = list.findIndex((one) => one.id === id)

  if (at < 0 || list[at]?.nextAt !== expected) return null

  return list.map((one, index) => (index === at ? { ...one, nextAt: next.nextAt } : one))
}

/** Итог - накладыванием на перечитанную запись: человек мог поменять время, пока шёл запуск. */
export const settleHour = (
  list: ScenarioSchedule[],
  id: string,
  due: number,
  firedAt: number,
  ran: boolean,
): ScenarioSchedule[] =>
  list.flatMap((one) => {
    if (one.id !== id) return [one]

    const result = settled(one, due, firedAt, ran)

    return result ? [result] : []
  })

/** Часы удалённых сценариев уходят, полка идёт за сценарием; нечитаемая полка не стирает часы. */
export const keepSchedules = (
  list: ScenarioSchedule[],
  project: Scenario[] | null,
  user: Scenario[] | null,
): ScenarioSchedule[] => {
  const seen = [...(project ?? []), ...(user ?? [])]

  return list.flatMap((schedule) => {
    const found = seen.filter((scenario) => scenario.id === schedule.scenarioId)

    if (found.length === 1 && found[0] && found[0].scope !== schedule.scope) {
      return [{ ...schedule, scope: found[0].scope }]
    }

    if (found.length > 0 || project === null || user === null) return [schedule]

    return []
  })
}

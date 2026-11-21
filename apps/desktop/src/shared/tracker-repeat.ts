import type { TrackerDue, TrackerRepeat } from './tracker'

/**
 * Счёт повтора карточки трекера (ADR 0103) - один у главного процесса (отметка «сделано»
 * сдвигает срок) и у окна (подпись «дальше - ...»). Даты считаются номерами календарных дней без
 * пояса: переход на летнее время и пояс машины день не сдвигают, а «сегодня» - по часам машины.
 */

const DAY_MS = 24 * 60 * 60 * 1000

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Номер календарного дня даты `YYYY-MM-DD` (1970-01-01 - ноль); null - не дата календаря. */
export const dayNumber = (date: string): number | null => {
  const match = DATE.exec(date)

  if (!match) return null

  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
  const moment = new Date(Date.UTC(year, month, day))

  return moment.getUTCFullYear() === year &&
    moment.getUTCMonth() === month &&
    moment.getUTCDate() === day
    ? moment.getTime() / DAY_MS
    : null
}

/** Дата `YYYY-MM-DD` номера дня. */
export const dateOfDay = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10)

/** Сегодня по часам этой машины - номером дня. */
export const todayNumber = (now: number): number => {
  const moment = new Date(now)

  return Date.UTC(moment.getFullYear(), moment.getMonth(), moment.getDate()) / DAY_MS
}

/** День недели номера дня: 1 - понедельник … 7 - воскресенье (1970-01-01 - четверг). */
export const weekdayOf = (day: number): number => ((((day + 3) % 7) + 7) % 7) + 1

const partsOf = (day: number) => {
  const moment = new Date(day * DAY_MS)

  return {
    month: moment.getUTCFullYear() * 12 + moment.getUTCMonth(),
    date: moment.getUTCDate(),
  }
}

/** День месяца (номер - год * 12 + месяц) с числом date: 31-е в коротком месяце - последнее. */
const dayInMonth = (month: number, date: number): number => {
  const year = Math.floor(month / 12)
  const index = month - year * 12
  const last = new Date(Date.UTC(year, index + 1, 0)).getUTCDate()

  return Date.UTC(year, index, Math.min(date, last)) / DAY_MS
}

/** Дни недельного повтора: без своих - день недели начала. */
const weekdaysOf = (repeat: TrackerRepeat, start: number): number[] =>
  repeat.weekdays.length > 0 ? [...repeat.weekdays].sort((a, b) => a - b) : [weekdayOf(start)]

/** Первый день расписания (от start) не раньше from. */
const occurrenceFrom = (repeat: TrackerRepeat, start: number, from: number): number => {
  const target = Math.max(from, start)
  // Правило из книги проверено, но шаг меньше единицы зациклил бы поиск недели навсегда.
  const every = Math.max(1, Math.floor(repeat.every))

  switch (repeat.unit) {
    case 'day':
      return start + Math.ceil((target - start) / every) * every
    case 'week': {
      const days = weekdaysOf(repeat, start)
      // Чётность недель - от недели первого дня правила, а не самого начала: «каждый второй
      // понедельник», заведённый в воскресенье, начинается завтра, а не через восемь дней.
      const first = start + Math.min(...days.map((day) => (day - weekdayOf(start) + 7) % 7))
      const monday = first - (weekdayOf(first) - 1)
      // Неделя цели, а если она не своя (каждые две недели) - ближайшая своя после неё.
      let week = Math.ceil(Math.floor((target - monday) / 7) / every) * every

      for (;;) {
        const hit = days.map((one) => monday + week * 7 + one - 1).find((day) => day >= target)

        if (hit !== undefined) return hit

        week += every
      }
    }
    case 'month':
    case 'year': {
      const step = repeat.unit === 'month' ? every : every * 12
      const first = partsOf(start)
      let index = Math.max(0, Math.ceil((partsOf(target).month - first.month) / step))
      let day = dayInMonth(first.month + index * step, first.date)

      if (day < target) {
        index += 1
        day = dayInMonth(first.month + index * step, first.date)
      }

      return day
    }
  }
}

/** Через every единиц от дня - для повтора «от выполнения»: месяц и год - тем же числом. */
const shiftFrom = (repeat: TrackerRepeat, day: number): number => {
  const every = Math.max(1, Math.floor(repeat.every))

  switch (repeat.unit) {
    case 'day':
      return day + every
    case 'week':
      return day + every * 7
    case 'month':
    case 'year': {
      const { month, date } = partsOf(day)

      return dayInMonth(month + (repeat.unit === 'month' ? 1 : 12) * every, date)
    }
  }
}

const minutesOf = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number)

  return (hours ?? 0) * 60 + (minutes ?? 0)
}

/** Срок словами, «2026-11-21» или «2026-11-21 09:30»: метка круга - на него уже отправляли. */
export const dueKey = (due: TrackerDue): string => (due.time ? `${due.date} ${due.time}` : due.date)

/** Первый день, чей момент срока (время due, без времени - начало дня) позже момента at. */
const dayAfter = (due: TrackerDue, at: number): number => {
  const clock = new Date(at)
  const passed =
    due.time === null || clock.getHours() * 60 + clock.getMinutes() >= minutesOf(due.time)

  return todayNumber(at) + (passed ? 1 : 0)
}

/**
 * Срок после отметки «сделано». По расписанию - следующий день правила после нынешнего срока,
 * но не в прошлом, как в Todoist: просроченная ежедневная задача встаёт на сегодня, а если её
 * время сегодня уже прошло - на завтра. sentAt - когда карточку отправили прогоном: круг, срок
 * которого к тому моменту уже пришёл, прогон закрыл тоже, иначе наверстанный после выходных
 * ежедневный срок без времени сразу запустился бы ещё раз. «От выполнения» - every единиц от
 * сегодняшнего дня. Время суток остаётся тем же.
 */
export const nextRepeat = (
  repeat: TrackerRepeat,
  due: TrackerDue,
  now: number,
  sentAt: number | null = null,
): TrackerDue => {
  const today = todayNumber(now)

  if (repeat.fromDone) return { date: dateOfDay(shiftFrom(repeat, today)), time: due.time }

  const current = dayNumber(due.date) ?? today
  const start = dayNumber(repeat.start) ?? current
  const clock = new Date(now)
  const late =
    due.time !== null && clock.getHours() * 60 + clock.getMinutes() >= minutesOf(due.time)
  const floor = Math.max(late ? today + 1 : today, sentAt === null ? 0 : dayAfter(due, sentAt))

  return {
    date: dateOfDay(occurrenceFrom(repeat, start, Math.max(current + 1, floor))),
    time: due.time,
  }
}

/** Первый день правила не раньше date (и не раньше начала правила). */
export const firstRepeat = (repeat: TrackerRepeat, date: string): string => {
  const from = dayNumber(date) ?? 0
  const start = dayNumber(repeat.start) ?? from

  return dateOfDay(occurrenceFrom(repeat, start, from))
}

/** Подходит ли день правилу: у повтора «от выполнения» подходит любой. */
export const fitsRepeat = (repeat: TrackerRepeat, date: string): boolean =>
  repeat.fromDone || firstRepeat(repeat, date) === date

/**
 * Срок под новое правило, как в Todoist: без срока - первый день правила от сегодня (today -
 * `YYYY-MM-DD`), срок не на день правила («каждый понедельник» у карточки на среду) - ближайший
 * день правила после него, подходящий - тот же объект. Одно правило у главного процесса и формы.
 */
export const dueForRule = (
  repeat: TrackerRepeat,
  due: TrackerDue | null,
  today: string,
): TrackerDue => {
  if (!due) return { date: firstRepeat(repeat, today), time: null }

  return fitsRepeat(repeat, due.date) ? due : { ...due, date: firstRepeat(repeat, due.date) }
}

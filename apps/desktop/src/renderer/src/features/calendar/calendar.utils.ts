import type { CalendarMeeting, CalendarOverlap } from '@shared/calendar-overlaps'
import { MINUTE_MS } from '@shared/time-units'

import { WEEK_DAYS, DAY_MINUTES, MONTH_GRID_DAYS, MIN_BLOCK_MINUTES } from './calendar.constants'
import type { DayBlock, ClashZone, CalendarMode, CalendarPeriod } from './calendar.types'

/** Местная полночь дня момента. */
export const startOfDay = (ms: number): number => {
  const date = new Date(ms)

  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Местная полночь через days дней: сутки при переводе часов - 23 и 25 часов, считаем календарём. */
export const addDays = (midnight: number, days: number): number => {
  const date = new Date(midnight)

  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime()
}

/** Понедельник недели дня: неделя сетки - с понедельника. */
export const startOfWeek = (ms: number): number => {
  const midnight = startOfDay(ms)
  const weekday = (new Date(midnight).getDay() + 6) % 7

  return addDays(midnight, -weekday)
}

/** Полночь первого числа месяца дня. */
export const startOfMonth = (ms: number): number => {
  const date = new Date(ms)

  return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
}

/**
 * Период сетки: неделя вокруг дня (с понедельника), сам день или месяц - шесть недель с
 * понедельника до первого числа: любой месяц целиком, а высота сетки не прыгает.
 */
export const periodOf = (mode: CalendarMode, anchor: number): CalendarPeriod => {
  const month = startOfMonth(anchor)
  const from =
    mode === 'month'
      ? startOfWeek(month)
      : mode === 'week'
        ? startOfWeek(anchor)
        : startOfDay(anchor)
  const count = mode === 'month' ? MONTH_GRID_DAYS : mode === 'week' ? WEEK_DAYS : 1
  const days = Array.from({ length: count }, (_, index) => addDays(from, index))

  return { from, to: addDays(from, count), days, month }
}

/** Соседний период: step - назад (-1) или вперёд (1) на неделю, день или месяц. */
export const steppedAnchor = (mode: CalendarMode, anchor: number, step: -1 | 1): number => {
  if (mode === 'month') {
    const date = new Date(anchor)

    return new Date(date.getFullYear(), date.getMonth() + step, 1).getTime()
  }

  return addDays(startOfDay(anchor), step * (mode === 'week' ? WEEK_DAYS : 1))
}

/** Дата дня на часах этого компьютера: «2026-11-24» - так хранятся события на весь день. */
export const localDateOf = (midnight: number): string => {
  const date = new Date(midnight)
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** События на весь день, задевающие этот день (даты сравниваются строкой: пояс не важен). */
export const allDayOn = (meetings: readonly CalendarMeeting[], midnight: number) => {
  const date = localDateOf(midnight)

  return meetings.filter(
    ({ event }) => event.allDay && event.allDay.from <= date && date < event.allDay.to,
  )
}

/**
 * Прошла ли встреча: со временем - кончилась (идущая ещё нет), на весь день - её последний день
 * раньше сегодняшнего. Прошедшие на сетке тише: сразу видно, что их время позади.
 */
export const isPastMeeting = ({ event }: CalendarMeeting, now: number): boolean =>
  event.allDay ? event.allDay.to <= localDateOf(startOfDay(now)) : event.end <= now

type Fragment = { meeting: CalendarMeeting; startMinute: number; endMinute: number }

const minuteOf = (ms: number, midnight: number) => Math.round((ms - midnight) / MINUTE_MS)

/** Часть встречи со временем на этом дне: обрезана полночами, короткая - не ниже минимума. */
const fragmentsOn = (meetings: readonly CalendarMeeting[], day: number, next: number): Fragment[] =>
  meetings
    .filter(({ event }) => !event.allDay && event.start < next && event.end > day)
    .map((meeting) => {
      const startMinute = Math.max(0, minuteOf(meeting.event.start, day))
      const end = Math.min(DAY_MINUTES, minuteOf(meeting.event.end, day))

      return {
        meeting,
        startMinute: Math.min(startMinute, DAY_MINUTES - MIN_BLOCK_MINUTES),
        endMinute: Math.max(end, startMinute + MIN_BLOCK_MINUTES),
      }
    })
    .sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute)

/**
 * Общее время накладок встречи внутри её блока на этом дне: доли высоты блока. Зона живёт в
 * самом блоке и обрезается его краями - полоса под соседними блоками вылезала бы из-за них.
 */
const zonesOf = (
  fragment: Fragment,
  overlaps: readonly CalendarOverlap[],
  day: number,
): ClashZone[] => {
  const { meeting, startMinute, endMinute } = fragment
  const length = endMinute - startMinute

  return overlaps
    .filter((overlap) => overlap.a === meeting.key || overlap.b === meeting.key)
    .map((overlap) => {
      const from = Math.max(startMinute, minuteOf(overlap.start, day))
      const to = Math.min(endMinute, minuteOf(overlap.end, day))

      return {
        top: (from - startMinute) / length,
        height: (to - from) / length,
        soft: overlap.soft,
      }
    })
    .filter((zone) => zone.height > 0)
}

/**
 * Встречи дня колонками, как в календарях: пересекающиеся (по видимой высоте) делят ширину,
 * каждая - в первую свободную колонку своей группы. Накладка - по правилам накладок, а не по
 * высоте: короткая встреча встык с длинной выглядит соседом, но накладкой не считается.
 */
export const blocksOn = (
  meetings: readonly CalendarMeeting[],
  overlaps: readonly CalendarOverlap[],
  day: number,
): DayBlock[] => {
  const clash = new Map<string, boolean>()

  for (const overlap of overlaps) {
    for (const key of [overlap.a, overlap.b]) {
      clash.set(key, (clash.get(key) ?? true) && overlap.soft)
    }
  }

  const blocks: DayBlock[] = []
  let group: DayBlock[] = []
  let groupEnd = -1
  const closeGroup = () => {
    const columns = Math.max(1, ...group.map((block) => block.column + 1))

    for (const block of group) block.columns = columns

    group = []
  }

  for (const fragment of fragmentsOn(meetings, day, addDays(day, 1))) {
    if (fragment.startMinute >= groupEnd) closeGroup()

    const taken = new Set(
      group.filter((block) => block.endMinute > fragment.startMinute).map((block) => block.column),
    )
    let column = 0

    while (taken.has(column)) column += 1

    const soft = clash.get(fragment.meeting.key)
    const block = {
      ...fragment,
      column,
      columns: 1,
      clashing: soft !== undefined,
      soft: soft === true,
      zones: zonesOf(fragment, overlaps, day),
    }

    group.push(block)
    blocks.push(block)
    groupEnd = Math.max(groupEnd, fragment.endMinute)
  }

  closeGroup()

  return blocks
}

/** Доля суток в процентах: верх и высота блока на сетке. */
export const percentOfDay = (minutes: number): string => `${(minutes / DAY_MINUTES) * 100}%`

/** Ближайшая накладка после периода: «следующая» листает к ней; нет - null. */
export const nextOverlapAfter = (starts: readonly number[], after: number): number | null =>
  starts.find((start) => start >= after) ?? null

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

/** День недели над колонкой: «Mon»; число - отдельной строкой под ним. */
export const weekdayLabel = (midnight: number): string => WEEKDAY.format(midnight)

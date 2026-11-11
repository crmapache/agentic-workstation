import type { DatabaseSync } from 'node:sqlite'

import type {
  StatsPeak,
  StatsStreaks,
  StatsCalendarDay,
  StatsWorkSessions,
} from '@shared/statistics'
import { MINUTE_MS } from '@shared/time-units'

import { SLOT_MS, PEAK_SPAN, CALENDAR_WEEKS, WORK_SESSION_GAP_MINUTES } from '../stats.constants'
import type { Scope } from './query-scope'
import { agentWhere, humanWhere, HUMAN_PROMPTS } from './query-scope'
import {
  streaksOf,
  bestWindow,
  workSessions,
  dayIndexLabel,
  dayIndexStart,
  localDayIndex,
} from './time-math'

const MINUTES_PER_SLOT = SLOT_MS / MINUTE_MS

type SlotValue = { slot: number; value: number }

/** Числа по четвертям часа: местные дни, дни недели и часы собираются из них в JS. */
const slots = (db: DatabaseSync, sql: string, params: Record<string, number | string>) =>
  db.prepare(sql).all(params) as SlotValue[]

const presenceSlots = (db: DatabaseSync, scope: Scope) => {
  const where = humanWhere(scope)

  return slots(
    db,
    `SELECT minute / ${MINUTES_PER_SLOT} AS slot, COUNT(DISTINCT minute) AS value FROM presence
     WHERE ${where.sql} GROUP BY slot`,
    where.params,
  )
}

const tokenSlots = (db: DatabaseSync, scope: Scope) => {
  const where = agentWhere(scope)

  return slots(
    db,
    `SELECT ts / ${SLOT_MS} AS slot, SUM(input + output + cache_read + cache_write) AS value
     FROM answers WHERE ${where.sql} GROUP BY slot`,
    where.params,
  )
}

const promptSlots = (db: DatabaseSync, scope: Scope) => {
  const where = agentWhere(scope)

  return slots(
    db,
    `SELECT ts / ${SLOT_MS} AS slot, COUNT(*) AS value FROM prompts
     WHERE ${HUMAN_PROMPTS} AND ${where.sql} GROUP BY slot`,
    where.params,
  )
}

/** Понедельник - 0: неделя человека, а не американская. */
const weekdayOf = (ms: number): number => (new Date(ms).getDay() + 6) % 7

/** Календарь за CALENDAR_WEEKS недель по сегодня: с понедельника первой недели. */
export const queryCalendar = (db: DatabaseSync, scope: Scope, now: number): StatsCalendarDay[] => {
  const today = localDayIndex(now)
  const first = today - weekdayOf(now) - (CALENDAR_WEEKS - 1) * 7
  const range: Scope = { ...scope, from: dayIndexStart(first), to: dayIndexStart(today + 1) }
  const days: StatsCalendarDay[] = []

  for (let index = first; index <= today; index += 1) {
    days.push({
      day: dayIndexLabel(index),
      start: dayIndexStart(index),
      presenceMinutes: 0,
      tokens: 0,
      prompts: 0,
    })
  }

  const dayOf = (slot: number) => days[localDayIndex(slot * SLOT_MS) - first]

  for (const row of presenceSlots(db, range)) {
    const day = dayOf(row.slot)

    if (day) day.presenceMinutes += row.value
  }

  for (const row of tokenSlots(db, range)) {
    const day = dayOf(row.slot)

    if (day) day.tokens += row.value
  }

  for (const row of promptSlots(db, range)) {
    const day = dayOf(row.slot)

    if (day) day.prompts += row.value
  }

  return days
}

/** Серии за всё время: день активен, если в нём есть присутствие или сообщение человека. */
export const queryStreaks = (db: DatabaseSync, scope: Scope, now: number): StatsStreaks => {
  const all: Scope = { ...scope, from: 0, to: now + 1 }
  const active = new Set<number>()

  for (const row of [...presenceSlots(db, all), ...promptSlots(db, all)]) {
    if (row.value > 0) active.add(localDayIndex(row.slot * SLOT_MS))
  }

  return streaksOf(active, localDayIndex(now))
}

/** Пик периода: по присутствию, если оно есть, иначе по токенам. */
export const queryPeak = (db: DatabaseSync, scope: Scope): StatsPeak => {
  const presence = presenceSlots(db, scope)
  const basis = presence.some((row) => row.value > 0) ? 'presence' : 'tokens'
  const rows = basis === 'presence' ? presence : tokenSlots(db, scope)
  const weekdays = Array.from({ length: 7 }, () => 0)
  const hours = Array.from({ length: 24 }, () => 0)

  for (const row of rows) {
    const at = row.slot * SLOT_MS
    const weekday = weekdayOf(at)
    const hour = new Date(at).getHours()

    weekdays[weekday] = (weekdays[weekday] ?? 0) + row.value
    hours[hour] = (hours[hour] ?? 0) + row.value
  }

  return { basis, weekdays: bestWindow(weekdays, PEAK_SPAN), hours: bestWindow(hours, PEAK_SPAN) }
}

/** Рабочие сессии периода: присутствие, разрезанное паузами больше 30 минут. */
export const queryWorkSessions = (db: DatabaseSync, scope: Scope): StatsWorkSessions => {
  const where = humanWhere(scope)
  const minutes = (
    db
      .prepare(`SELECT DISTINCT minute FROM presence WHERE ${where.sql} ORDER BY minute`)
      .all(where.params) as { minute: number }[]
  ).map((row) => row.minute)

  return workSessions(minutes, WORK_SESSION_GAP_MINUTES)
}

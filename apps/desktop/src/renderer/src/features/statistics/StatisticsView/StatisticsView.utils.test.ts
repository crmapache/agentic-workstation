import { it, expect, describe } from 'vitest'

import type { StatsProjectRow, StatsCalendarDay } from '@shared/statistics'

import { PRESENCE_DAYS_FOR_CALENDAR } from './StatisticsView.constants'
import { projectRows, calendarMetricOf } from './StatisticsView.utils'

const day = (index: number, presenceMinutes: number): StatsCalendarDay => ({
  day: `2026-10-${String(index + 1).padStart(2, '0')}`,
  start: index,
  presenceMinutes,
  tokens: 1000,
  prompts: 1,
})

const project = (path: string | null, tokens: number): StatsProjectRow => ({
  project: path,
  tokens,
  cost: tokens / 1000,
  agentLinesAdded: 10,
  agentLinesRemoved: 0,
  agentWorkMs: 60_000,
})

describe('правила вида статистики', () => {
  it('календарь по присутствию - только когда его набралось на две недели', () => {
    const few = Array.from({ length: 30 }, (_, index) => day(index, index < 3 ? 40 : 0))
    const enough = Array.from({ length: 30 }, (_, index) =>
      day(index, index < PRESENCE_DAYS_FOR_CALENDAR ? 40 : 0),
    )

    expect(calendarMetricOf(null, few)).toBe('tokens')
    expect(calendarMetricOf(null, enough)).toBe('presence')
    // Выбор человека важнее подсказки.
    expect(calendarMetricOf('presence', few)).toBe('presence')
  })

  it('проект без токенов в рейтинг токенов не попадает, текущий отмечен', () => {
    const rows = projectRows(
      [project('/p/a', 500), project('/p/empty', 0), project(null, 20)],
      '/p/a',
      'Other folders',
      (tokens) => String(tokens),
    )

    expect(rows.map((row) => row.label)).toEqual(['a', 'Other folders'])
    expect(rows[0]?.current).toBe(true)
    expect(rows[1]?.current).toBe(false)
  })
})

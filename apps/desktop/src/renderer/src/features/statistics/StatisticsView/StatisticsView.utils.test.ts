import { it, expect, describe } from 'vitest'

import type { StatsModelRow, StatsProjectRow, StatsCalendarDay } from '@shared/statistics'

import { rangeOf } from '../statistics-period.utils'
import { PRESENCE_DAYS_FOR_CALENDAR } from './StatisticsView.constants'
import { modelRows, projectRows, periodLabelOf, calendarMetricOf } from './StatisticsView.utils'

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

const model = (id: string, family: StatsModelRow['family']): StatsModelRow => ({
  model: id,
  family,
  tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
  cost: 1,
  answers: 1,
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

  it('модель - по семье из отчёта, полное имя - в подсказке; не Claude - как есть', () => {
    const rows = modelRows(
      [model('claude-3-5-haiku-20241022', 'haiku'), model('<synthetic>', 'other')],
      () => '',
    )

    expect(rows.map((row) => row.label)).toEqual(['Haiku 3.5', '<synthetic>'])
    expect(rows[0]?.hint).toBe('claude-3-5-haiku-20241022')
  })
})

describe('periodLabelOf', () => {
  const now = new Date('2026-11-14T10:00:00').getTime()
  const words = {
    today: 'Today',
    yesterday: 'Yesterday',
    range: (from: string, to: string) => `${from} - ${to}`,
  }
  const picked = (text: string) => new Date(`${text}T00:00:00`).getTime()

  it('сутки - словами рядом с сегодня, дальше - днём недели и датой', () => {
    expect(periodLabelOf('day', rangeOf('day', now, null), words)).toBe('Today')
    expect(periodLabelOf('day', rangeOf('day', now, picked('2026-11-13')), words)).toBe('Yesterday')
    expect(periodLabelOf('day', rangeOf('day', now, picked('2026-11-10')), words)).toBe(
      'Tue, Nov 10',
    )
  })

  it('7 дней - отрезком дат, прошлый год - с годом', () => {
    expect(periodLabelOf('week', rangeOf('week', now, null), words)).toBe('Nov 8 - Nov 14')
    expect(periodLabelOf('day', rangeOf('day', now, picked('2025-12-31')), words)).toBe(
      'Wed, Dec 31, 2025',
    )
  })
})

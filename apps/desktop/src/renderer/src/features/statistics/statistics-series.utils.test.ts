import { it, expect, describe } from 'vitest'

import type { StatsCalendarDay, StatsSeriesPoint } from '@shared/statistics'

import {
  barPointsOf,
  bucketLabelsOf,
  calendarDaysOf,
  chartBucketsOf,
  calendarWeekdayLabels,
} from './statistics-series.utils'

const day = (text: string) => new Date(`${text}T00:00:00`).getTime()

const point = (start: number, tokens = 0): StatsSeriesPoint => ({
  start,
  tokens,
  cost: 0,
  agentLinesAdded: 0,
  agentLinesRemoved: 0,
  manualLinesAdded: 0,
  manualLinesRemoved: 0,
  agentMinutes: 0,
  presenceMinutes: 0,
})

/** count дней подряд с 2026-01-05 (понедельник), токенов - номер дня. */
const days = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const date = new Date(2026, 0, 5 + index)

    return point(date.getTime(), index + 1)
  })

describe('chartBucketsOf', () => {
  it('часы и короткие периоды дней - как прислал главный процесс', () => {
    const series = { bucket: 'day' as const, points: days(30) }

    expect(chartBucketsOf(series)).toEqual(series)
  })

  it('длинная история - неделями с понедельника, числа сложены', () => {
    const chart = chartBucketsOf({ bucket: 'day', points: days(100) })

    expect(chart.bucket).toBe('week')
    expect(chart.points).toHaveLength(15)
    expect(chart.points[0]?.start).toBe(day('2026-01-05'))
    expect(chart.points[0]?.tokens).toBe(1 + 2 + 3 + 4 + 5 + 6 + 7)
    expect(chart.points.at(-1)?.tokens).toBe(99 + 100)
  })
})

describe('barPointsOf', () => {
  it('подписи под осью - не больше шести, полные - у каждого шага', () => {
    const chart = {
      bucket: 'hour' as const,
      points: Array.from({ length: 24 }, (_, hour) =>
        point(new Date(2026, 10, 10, hour).getTime()),
      ),
    }
    const bars = barPointsOf(
      chart,
      bucketLabelsOf('hour', (date) => date),
      (item) => [item.tokens],
    )

    expect(bars.filter((bar) => bar.axisLabel !== '').map((bar) => bar.axisLabel)).toEqual([
      '00:00',
      '04:00',
      '08:00',
      '12:00',
      '16:00',
      '20:00',
    ])
    expect(bars[14]?.label).toBe('Tue, Nov 10, 14:00')
  })

  it('неделя подписывается словами вызывающего', () => {
    const labels = bucketLabelsOf('week', (date) => `Week of ${date}`)

    expect(labels.full(day('2026-11-09'))).toBe('Week of Nov 9')
  })
})

describe('calendarDaysOf', () => {
  const calendarDay = (text: string, presenceMinutes: number): StatsCalendarDay => ({
    day: text,
    start: day(text),
    presenceMinutes,
    tokens: presenceMinutes * 1000,
    prompts: 0,
  })

  it('число по мере, месяц - на первое число и на начало, если до следующего далеко', () => {
    const result = calendarDaysOf(
      [calendarDay('2026-11-23', 5), calendarDay('2026-11-30', 0), calendarDay('2026-12-01', 30)],
      'presence',
      (value) => `${value}m`,
    )

    expect(result.map((item) => item.monthLabel)).toEqual([undefined, undefined, 'Dec'])
    expect(result[2]).toMatchObject({ value: 30, valueLabel: '30m', label: 'Tue, Dec 1' })
  })

  it('мера «токены» берёт токены дня', () => {
    expect(calendarDaysOf([calendarDay('2026-11-02', 2)], 'tokens', String)[0]).toMatchObject({
      value: 2000,
      monthLabel: 'Nov',
    })
  })

  it('подписаны понедельник, среда и пятница', () => {
    expect(calendarWeekdayLabels()).toEqual(['Mon', '', 'Wed', '', 'Fri', '', ''])
  })
})

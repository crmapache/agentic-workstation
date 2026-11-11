import type { StatsSeries, StatsCalendarDay, StatsSeriesPoint } from '@shared/statistics'
import { HOUR_MS, MINUTE_MS } from '@shared/time-units'

import type { BarChartPoint } from '@agentic-workstation/ui/BarChart.types'
import type { CalendarHeatmapDay } from '@agentic-workstation/ui/CalendarHeatmap.types'

import {
  dayLabel,
  clockLabel,
  monthLabel,
  weekdayNames,
  weekdayDayLabel,
} from './statistics-dates.utils'
import {
  AXIS_LABELS,
  MAX_DAY_BARS,
  LABELED_WEEKDAYS,
  FIRST_MONTH_LABEL_MAX_DAY,
} from './statistics.constants'
import type { ChartBucket, BucketLabels, ChartBuckets, CalendarMetric } from './statistics.types'

/** Числа точки графика, которые складываются, когда дни собираются в недели. */
const SUMMED = [
  'tokens',
  'cost',
  'agentLinesAdded',
  'agentLinesRemoved',
  'manualLinesAdded',
  'manualLinesRemoved',
  'agentMinutes',
  'presenceMinutes',
] as const satisfies readonly (keyof StatsSeriesPoint)[]

/** Понедельник недели дня, местная полночь. */
const weekStartOf = (ms: number): number => {
  const date = new Date(ms)

  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))

  return date.getTime()
}

/**
 * Шаги графиков вида: часы и дни - как прислал главный процесс, длинная история (больше
 * MAX_DAY_BARS дней) - неделями с понедельника.
 */
export const chartBucketsOf = (series: StatsSeries): ChartBuckets => {
  if (series.bucket === 'hour' || series.points.length <= MAX_DAY_BARS) {
    return { bucket: series.bucket, points: series.points }
  }

  const weeks = new Map<number, StatsSeriesPoint>()

  for (const point of series.points) {
    const start = weekStartOf(point.start)
    const week = weeks.get(start)

    if (week) for (const field of SUMMED) week[field] += point[field]
    else weeks.set(start, { ...point, start })
  }

  return { bucket: 'week', points: [...weeks.values()] }
}

/** Подписи шагов графика; неделя - словами из i18n («Week of Nov 10»). */
export const bucketLabelsOf = (
  bucket: ChartBucket,
  weekOf: (day: string) => string,
): BucketLabels => ({
  full: (start) =>
    bucket === 'hour'
      ? `${weekdayDayLabel(start)}, ${clockLabel(start)}`
      : bucket === 'day'
        ? weekdayDayLabel(start)
        : weekOf(dayLabel(start)),
  axis: (start) => (bucket === 'hour' ? clockLabel(start) : dayLabel(start)),
})

/**
 * Точки столбцового графика из шагов вида: числа рядов, подпись под осью не чаще, чем
 * влезает (AXIS_LABELS на ось), и строка под числами в подсказке.
 */
export const barPointsOf = (
  chart: ChartBuckets,
  labels: BucketLabels,
  values: (point: StatsSeriesPoint) => number[],
  note?: (point: StatsSeriesPoint) => string | undefined,
): BarChartPoint[] => {
  const step = Math.max(1, Math.ceil(chart.points.length / AXIS_LABELS))

  return chart.points.map((point, index) => ({
    key: String(point.start),
    label: labels.full(point.start),
    axisLabel: index % step === 0 ? labels.axis(point.start) : '',
    values: values(point),
    note: note?.(point),
  }))
}

/**
 * Единица времени на графике: часы дня - минутами, дни и недели - часами. Шкала тогда
 * круглая («30m», «8h»), а не «16h 40m» от круглого числа минут.
 */
export const timeUnitOf = (bucket: ChartBucket): number => (bucket === 'hour' ? MINUTE_MS : HOUR_MS)

/** Дни календаря активности: число по выбранной мере и подпись месяца на первое число. */
export const calendarDaysOf = (
  calendar: readonly StatsCalendarDay[],
  metric: CalendarMetric,
  valueLabel: (value: number) => string,
): CalendarHeatmapDay[] =>
  calendar.map((day, index) => {
    const date = new Date(day.start).getDate()
    const value = metric === 'presence' ? day.presenceMinutes : day.tokens
    const labeled = date === 1 || (index === 0 && date <= FIRST_MONTH_LABEL_MAX_DAY)

    return {
      key: day.day,
      value,
      label: weekdayDayLabel(day.start),
      valueLabel: valueLabel(value),
      monthLabel: labeled ? monthLabel(day.start) : undefined,
    }
  })

/** Подписи строк календаря: понедельник, среда, пятница - остальные пустые. */
export const calendarWeekdayLabels = (): string[] =>
  weekdayNames().map((name, index) => (LABELED_WEEKDAYS.includes(index) ? name : ''))

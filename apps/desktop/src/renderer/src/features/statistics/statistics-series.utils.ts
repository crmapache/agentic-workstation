import type { StatsSeries, StatsCalendarDay, StatsSeriesPoint } from '@shared/statistics'
import { HOUR_MS, MINUTE_MS } from '@shared/time-units'

import type { BarChartPoint } from '@agentic-workstation/ui/BarChart.types'
import type { CalendarHeatmapDay } from '@agentic-workstation/ui/CalendarHeatmap.types'

import { clockLabel, weekdayDayLabel } from '../../lib/dates.utils'
import { weekdayNames } from '../../lib/dates.utils'
import { dayLabel, monthLabel } from './statistics-dates.utils'
import { startOfDay } from './statistics-period.utils'
import {
  AXIS_LABELS,
  MAX_DAY_BARS,
  DAY_LABEL_HOUR,
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
  'agentsWithoutYouMinutes',
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

/** Суббота или воскресенье: шаг на графике - на полосе выходных. */
const isWeekend = (ms: number): boolean => {
  const weekday = new Date(ms).getDay()

  return weekday === 0 || weekday === 6
}

/** Шаги графика по часам лежат больше чем в одних сутках (неделя). */
const spansDays = (chart: ChartBuckets): boolean => {
  const first = chart.points[0]
  const last = chart.points.at(-1)

  return (
    chart.bucket === 'hour' &&
    first !== undefined &&
    last !== undefined &&
    startOfDay(first.start) !== startOfDay(last.start)
  )
}

/**
 * Разметка шагов: подпись под осью, полоса выходных и линия суток. Неделя по часам делится
 * на сутки, как в календаре: линия перед полуночью, дата - под полднем, то есть по середине
 * суток, выходные - полосой. Дни - полосой выходных и подписью не чаще, чем влезает
 * (AXIS_LABELS на ось). Одни сутки по часам - подписями часов, без полос.
 */
const stepMarksOf = (
  chart: ChartBuckets,
  labels: BucketLabels,
): Pick<BarChartPoint, 'axisLabel' | 'shaded' | 'boundary'>[] => {
  if (spansDays(chart)) {
    return chart.points.map((point, index) => {
      const hour = new Date(point.start).getHours()

      return {
        axisLabel: hour === DAY_LABEL_HOUR ? dayLabel(point.start) : '',
        shaded: isWeekend(point.start),
        boundary: index > 0 && hour === 0,
      }
    })
  }

  const step = Math.max(1, Math.ceil(chart.points.length / AXIS_LABELS))

  return chart.points.map((point, index) => ({
    axisLabel: index % step === 0 ? labels.axis(point.start) : '',
    shaded: chart.bucket === 'day' && isWeekend(point.start),
  }))
}

/**
 * Точки столбцового графика из шагов вида: числа рядов, разметка шагов (подписи под осью,
 * сутки, выходные) и строка под числами в подсказке.
 */
export const barPointsOf = (
  chart: ChartBuckets,
  labels: BucketLabels,
  values: (point: StatsSeriesPoint) => number[],
  note?: (point: StatsSeriesPoint) => string | undefined,
): BarChartPoint[] => {
  const marks = stepMarksOf(chart, labels)

  return chart.points.map((point, index) => ({
    ...marks[index],
    key: String(point.start),
    label: labels.full(point.start),
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

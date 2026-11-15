import type { StatsPeriod, StatsReport, StatsSeriesPoint } from '@shared/statistics'

import type { ChartTone } from '@agentic-workstation/ui/ChartTip.types'

/**
 * Период вида: сутки, 7 и 30 дней - по выбранный день включительно (по умолчанию сегодня),
 * всё время - по сегодня.
 */
export type PeriodKind = 'day' | 'week' | 'month' | 'all'

/** Какие проекты: все или открытый сейчас. */
export type ScopeKind = 'all' | 'project'

/** Что красит календарь активности: присутствие человека или токены агентов. */
export type CalendarMetric = 'presence' | 'tokens'

/** Шаг графика вида: главный процесс даёт часы и дни, длинную историю окно складывает неделями. */
export type ChartBucket = 'hour' | 'day' | 'week'

export type ChartBuckets = { bucket: ChartBucket; points: StatsSeriesPoint[] }

/** Подписи шага: полная - в подсказке и таблице, короткая - под осью. */
export type BucketLabels = { full: (start: number) => string; axis: (start: number) => string }

/**
 * Изменение числа против прошлого периода. percent null - прошлое было нулём, сейчас нет
 * («new»): процент от нуля ничего не значит.
 */
export type Delta = { direction: 'up' | 'down' | 'flat'; percent: number | null }

/**
 * Что вид знает про период: отчёт, честное сравнение (тот же отрезок прошлого периода) -
 * отдельно для агентских чисел и для человеческих, которые копятся позже.
 */
export type StatisticsData = {
  report: StatsReport
  /** Прошлый период до того же места, что текущий; null - сравнивать нечестно или не с чем. */
  previous: StatsReport['totals'] | null
  /** Присутствие и код руками есть и в прошлом периоде целиком - их можно сравнивать. */
  humanComparable: boolean
  /** Данные пересчитываются под новый период или фильтр: на экране ещё прежние. */
  refreshing: boolean
  /** С чем сравнивается период - для подсказки у изменения. */
  comparison: Comparison
}

/**
 * Сравнение периода с прошлым: live - период идёт сейчас и сравнивается до того же места
 * («Yesterday by this time»), иначе он в прошлом и сравнивается с прошлым целиком
 * («Previous day»).
 */
export type Comparison = { period: PeriodKind; live: boolean }

/** Период вида по фильтрам: его границы, сегодня и последний день (местные полуночи). */
export type StatisticsRange = {
  period: StatsPeriod
  today: number
  lastDay: number
}

/** Строка списка-рейтинга: подпись, число справа и куски полосы. */
export type RankedRow = {
  key: string
  label: string
  value: string
  /** Сколько весит строка - доли полосы от самой большой строки списка. */
  parts: readonly { key: string; value: number; tone: ChartTone }[]
  /** Подсказка к подписи - полное имя, когда оно обрезано или сокращено. */
  hint?: string | undefined
  /** Строка про то, что открыто сейчас (текущий проект) - ярче. */
  current?: boolean | undefined
}

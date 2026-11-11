import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import type { StatsTokens, StatsScanProgress } from '@shared/statistics'

import type { RankedRow, ChartBuckets, StatisticsData } from '../statistics.types'

/** О чём «?»: вид целиком или его раздел. */
export type HelpTopic =
  'page' | 'overview' | 'code' | 'time' | 'habits' | 'tokens' | 'scenarios' | 'tools'

export type StatisticsHelpProps = { topic: HelpTopic }

/** Раздел вида: числа периода и его шаги графиков (собраны один раз на весь вид). */
export type SectionProps = { data: StatisticsData; chart: ChartBuckets }

export type StatisticsPageProps = { data: StatisticsData }

export type ScanProgressProps = { scan: StatsScanProgress }

export type OverviewTileProps = {
  title: string
  icon: LucideIcon
  /** Главное число плитки, уже для людей. */
  value: string
  /** Единица после числа мелко: «lines changed», «tokens». */
  unit?: string | undefined
  /** Сравнение с прошлым: текущее и прошлое число; previous null - не сравниваем. */
  compare: { current: number; previous: number | null; format: (value: number) => string }
  period: StatisticsData['period']
  children?: ReactNode
}

export type DeltaMarkProps = Pick<OverviewTileProps, 'compare' | 'period'>

/** Сведение раздела: подпись тише, число ярче. */
export type Fact = { key: string; label: string; value: string }

export type FactGridProps = { facts: readonly Fact[] }

export type RankedListProps = {
  title: string
  rows: readonly RankedRow[]
  /** Строк нет: короткое состояние вместо списка. */
  emptyLabel: string
}

export type CacheShareProps = { tokens: StatsTokens }

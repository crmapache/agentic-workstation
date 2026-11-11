import clsx from 'clsx'
import { ChartColumn } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import styles from '../StatisticsView.module.scss'
import type { StatisticsPageProps } from '../StatisticsView.types'
import { chartBucketsOf } from '../../statistics-series.utils'
import { CodeSection } from './CodeSection'
import { HabitsSection } from './HabitsSection'
import { OverviewSection } from './OverviewSection'
import { ScanProgress } from './ScanProgress'
import { ScenariosSection } from './ScenariosSection'
import { TimeSection } from './TimeSection'
import { TokensSection } from './TokensSection'
import { ToolsSection } from './ToolsSection'

/**
 * Страница статистики под фильтрами: полоса первого чтения транскриптов, потом разделы.
 * Пока считается новый срез, на месте прежний, приглушённый, - без пустого мигания. Данных
 * нет совсем (и чтение не идёт) - пустое место с объяснением.
 */
export const StatisticsPage = ({ data }: StatisticsPageProps) => {
  const { t } = useTranslation()
  const { report } = data
  const chart = chartBucketsOf(report.series)

  if (report.dataStart === null && !report.scan.running) {
    return (
      <EmptyState
        icon={ChartColumn}
        title={t('statistics.empty.title')}
        description={t('statistics.empty.text')}
      />
    )
  }

  return (
    <div className={clsx(styles.page, data.refreshing && styles.refreshing)}>
      <ScanProgress scan={report.scan} />
      <OverviewSection data={data} />
      <CodeSection data={data} chart={chart} />
      <TimeSection data={data} chart={chart} />
      <HabitsSection data={data} />
      <TokensSection data={data} chart={chart} />
      <ScenariosSection data={data} />
      <ToolsSection data={data} />
    </div>
  )
}

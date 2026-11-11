import clsx from 'clsx'
import { ChartColumn } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import styles from '../StatisticsView.module.scss'
import type { StatisticsPageProps } from '../StatisticsView.types'
import { bucketLabelsOf, chartBucketsOf } from '../../statistics-series.utils'
import { useStatsScan } from '../../../../state/statistics.queries'
import { CodeSection } from './CodeSection'
import { HabitsSection } from './HabitsSection'
import { OverviewSection } from './OverviewSection'
import { ScanProgress } from './ScanProgress'
import { ScenariosSection } from './ScenariosSection'
import { TimeSection } from './TimeSection'
import { TokensSection } from './TokensSection'
import { ToolsSection } from './ToolsSection'

/**
 * Страница статистики под фильтрами: полоса первого чтения транскриптов, потом разделы. Шаги
 * графиков и их подписи собираются здесь один раз - у трёх графиков они общие. Пока считается
 * новый срез, на месте прежний, приглушённый, - без пустого мигания. Данных нет совсем (и
 * чтение не идёт) - пустое место с объяснением.
 */
export const StatisticsPage = ({ data }: StatisticsPageProps) => {
  const { t } = useTranslation()
  const { data: scan } = useStatsScan()
  const { report } = data
  const chart = chartBucketsOf(report.series)
  const labels = bucketLabelsOf(chart.bucket, (date) => t('statistics.week', { date }))

  // Пока главный процесс не сказал, как идёт чтение, пустое место не показываем: на первом
  // запуске оно мигнуло бы до начала чтения.
  if (report.dataStart === null && scan !== undefined && !scan.running) {
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
      {scan && <ScanProgress scan={scan} />}
      <OverviewSection data={data} />
      <CodeSection data={data} chart={chart} labels={labels} />
      <TimeSection data={data} chart={chart} labels={labels} />
      <HabitsSection data={data} />
      <TokensSection data={data} chart={chart} labels={labels} />
      <ScenariosSection data={data} />
      <ToolsSection data={data} />
    </div>
  )
}

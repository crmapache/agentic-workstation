import { ChartColumn } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { PageHeader } from '@agentic-workstation/ui/PageHeader'

import { useStatisticsData } from './StatisticsView.hooks'
import styles from './StatisticsView.module.scss'
import { StatisticsFilters } from './parts/StatisticsFilters'
import { StatisticsHelp } from './parts/StatisticsHelp'
import { StatisticsPage } from './parts/StatisticsPage'

/**
 * Статистика IDE в середине окна (docs/workplan/20-statistics.md, ADR 0030): шапка вида,
 * фильтры одной строкой, под ними разделы - сводка, код, время, привычки, токены, сценарии,
 * инструменты. Агенты - вся машина (транскрипты Claude Code), человек - только окно IDE.
 * Числа считает главный процесс, здесь только вид.
 */
export const StatisticsView = () => {
  const { t } = useTranslation()
  const { data, failed } = useStatisticsData()

  return (
    <div className={styles.view}>
      <PageHeader
        icon={ChartColumn}
        title={t('statistics.title')}
        help={<StatisticsHelp topic="page" />}
      />
      <StatisticsFilters />
      <div className={styles.scroller}>
        {data && <StatisticsPage data={data} />}
        {failed && (
          <EmptyState
            icon={ChartColumn}
            title={t('statistics.title')}
            description={t('statistics.error')}
          />
        )}
      </div>
    </div>
  )
}

import { useTranslation } from 'react-i18next'

import { Section } from '@agentic-workstation/ui/Section'

import styles from '../StatisticsView.module.scss'
import type { SectionProps } from '../StatisticsView.types'
import {
  formatCost,
  formatCount,
  formatPercent,
  formatDuration,
} from '../../statistics-format.utils'
import { AGENTS_TONE } from '../../statistics.constants'
import { FactGrid } from './FactGrid'
import { RankedList } from './RankedList'
import { StatisticsHelp } from './StatisticsHelp'

/**
 * Сценарии: сколько прогонов начато в периоде, доля успешных среди законченных, среднее
 * время работы и цена прогона, самые частые сценарии. Вне IDE сценариев нет - так и сказано.
 */
export const ScenariosSection = ({ data }: Pick<SectionProps, 'data'>) => {
  const { t } = useTranslation()
  const scenarios = data.report.scenarios
  const empty = scenarios.runs === 0

  return (
    <Section
      title={t('statistics.scenarios.title')}
      count={empty ? undefined : formatCount(scenarios.runs)}
      help={<StatisticsHelp topic="scenarios" />}>
      {empty ? (
        <p className={styles.note}>
          {t(
            data.report.filter.source === 'outside'
              ? 'statistics.scenarios.outside'
              : 'statistics.scenarios.empty',
          )}
        </p>
      ) : (
        <div className={styles.split}>
          <FactGrid
            facts={[
              {
                key: 'runs',
                label: t('statistics.scenarios.runs'),
                value: formatCount(scenarios.runs),
              },
              {
                key: 'done',
                label: t('statistics.scenarios.done'),
                value: formatPercent(scenarios.doneShare),
              },
              {
                key: 'time',
                label: t('statistics.scenarios.averageTime'),
                value: formatDuration(scenarios.averageActiveMs),
              },
              {
                key: 'cost',
                label: t('statistics.scenarios.averageCost'),
                value: formatCost(scenarios.averageCost),
              },
            ]}
          />
          <RankedList
            title={t('statistics.scenarios.top')}
            emptyLabel={t('statistics.nothing')}
            rows={scenarios.top.map((row) => ({
              key: row.scenario,
              label: row.scenario,
              hint: row.scenario,
              value: t('statistics.scenarios.runCount', { count: row.runs }),
              parts: [{ key: 'runs', value: row.runs, tone: AGENTS_TONE }],
            }))}
          />
        </div>
      )}
    </Section>
  )
}

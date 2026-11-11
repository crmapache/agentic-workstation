import { useTranslation } from 'react-i18next'

import { BarChart } from '@agentic-workstation/ui/BarChart'
import { Card } from '@agentic-workstation/ui/Card'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../StatisticsView.module.scss'
import type { SectionProps } from '../StatisticsView.types'
import { modelRows, projectRows } from '../StatisticsView.utils'
import { formatCost, formatCount } from '../../statistics-format.utils'
import { barPointsOf } from '../../statistics-series.utils'
import { tokensOf } from '../../statistics-totals.utils'
import { AGENTS_TONE } from '../../statistics.constants'
import { useActiveProject } from '../../../../state/workspace.queries'
import { CacheShare } from './CacheShare'
import { FactGrid } from './FactGrid'
import { RankedList } from './RankedList'
import { StatisticsHelp } from './StatisticsHelp'

/**
 * Токены и цена: токены по шагам (цена шага - в подсказке) и сведения периода слева, из чего
 * сложен вход модели (доля кеша) справа, ниже модели и проекты по цене и токенам - каждое
 * своей карточкой.
 */
export const TokensSection = ({ data, chart, labels }: SectionProps) => {
  const { t } = useTranslation()
  const activeProject = useActiveProject()
  const { report } = data
  const totals = report.totals
  const rowValue = (tokens: number, cost: number) =>
    t('statistics.tokens.rowValue', { tokens: formatCount(tokens), cost: formatCost(cost) })

  return (
    <Section title={t('statistics.tokens.title')} help={<StatisticsHelp topic="tokens" />}>
      <div className={styles.cards}>
        <div className={styles.split}>
          <Card title={t('statistics.tokens.chartTitle')}>
            <BarChart
              label={t('statistics.tokens.chart')}
              series={[{ key: 'tokens', label: t('statistics.tokens.series'), tone: AGENTS_TONE }]}
              points={barPointsOf(
                chart,
                labels,
                (point) => [point.tokens],
                (point) => t('statistics.tokens.costNote', { cost: formatCost(point.cost) }),
              )}
              formatValue={formatCount}
              emptyLabel={t('statistics.tokens.empty')}
              integer
            />
          </Card>
          <div className={styles.cards}>
            <Card>
              <FactGrid
                facts={[
                  {
                    key: 'total',
                    label: t('statistics.tokens.total'),
                    value: formatCount(tokensOf(totals.tokens)),
                  },
                  {
                    key: 'cost',
                    label: t('statistics.tokens.cost'),
                    value: formatCost(totals.cost),
                  },
                  {
                    key: 'output',
                    label: t('statistics.tokens.output'),
                    value: formatCount(totals.tokens.output),
                  },
                  {
                    key: 'sessions',
                    label: t('statistics.tokens.conversations'),
                    value: formatCount(totals.sessions),
                  },
                  {
                    key: 'prompts',
                    label: t('statistics.tokens.prompts'),
                    value: formatCount(totals.prompts),
                  },
                  {
                    key: 'answers',
                    label: t('statistics.tokens.answers'),
                    value: formatCount(totals.answers),
                  },
                ]}
              />
            </Card>
            <CacheShare tokens={totals.tokens} />
          </div>
        </div>
        <div className={styles.columns}>
          <RankedList
            title={t('statistics.tokens.models')}
            emptyLabel={t('statistics.nothing')}
            rows={modelRows(report.models, rowValue)}
          />
          <RankedList
            title={t('statistics.tokens.projects')}
            emptyLabel={t('statistics.nothing')}
            rows={projectRows(
              report.projects,
              activeProject?.rootPath ?? null,
              t('statistics.tokens.otherFolders'),
              rowValue,
            )}
          />
        </div>
      </div>
    </Section>
  )
}

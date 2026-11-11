import { useTranslation } from 'react-i18next'

import { BarChart } from '@agentic-workstation/ui/BarChart'
import { Section } from '@agentic-workstation/ui/Section'

import { useHumanNote } from '../StatisticsView.hooks'
import styles from '../StatisticsView.module.scss'
import type { SectionProps } from '../StatisticsView.types'
import { languageRows } from '../StatisticsView.utils'
import { shareOf, formatCount, formatPercent } from '../../statistics-format.utils'
import { barPointsOf } from '../../statistics-series.utils'
import { linesOf } from '../../statistics-totals.utils'
import { YOU_TONE, AGENTS_TONE } from '../../statistics.constants'
import { FactGrid } from './FactGrid'
import { RankedList } from './RankedList'
import { StatisticsHelp } from './StatisticsHelp'

/**
 * Код: строки руками и агентами по шагам рядом, сведения (набрано, вставлено, файлы, доля
 * агентов) и языки по расширениям. Код руками считается с выпуска статистики - строка под
 * заголовком говорит, с какого дня, если период начинается раньше.
 */
export const CodeSection = ({ data, chart, labels }: SectionProps) => {
  const { t } = useTranslation()
  const humanNote = useHumanNote(data.report)
  const { report } = data
  const totals = report.totals
  const lines = linesOf(totals)

  return (
    <Section
      title={t('statistics.code.title')}
      description={humanNote}
      help={<StatisticsHelp topic="code" />}>
      <div className={styles.split}>
        <div className={styles.stack}>
          <BarChart
            label={t('statistics.code.chart')}
            series={[
              { key: 'you', label: t('statistics.you'), tone: YOU_TONE },
              { key: 'agents', label: t('statistics.agents'), tone: AGENTS_TONE },
            ]}
            points={barPointsOf(chart, labels, (point) => [
              point.manualLinesAdded + point.manualLinesRemoved,
              point.agentLinesAdded + point.agentLinesRemoved,
            ])}
            formatValue={formatCount}
            emptyLabel={t('statistics.code.empty')}
            integer
          />
          <FactGrid
            facts={[
              {
                key: 'you',
                label: t('statistics.code.yourLines'),
                value: t('statistics.changes', {
                  added: formatCount(totals.manualLinesAdded),
                  removed: formatCount(totals.manualLinesRemoved),
                }),
              },
              { key: 'typed', label: t('statistics.code.typed'), value: formatCount(totals.typed) },
              {
                key: 'pasted',
                label: t('statistics.code.pasted'),
                value: formatCount(totals.pasted),
              },
              {
                key: 'agents',
                label: t('statistics.code.agentLines'),
                value: t('statistics.changes', {
                  added: formatCount(totals.agentLinesAdded),
                  removed: formatCount(totals.agentLinesRemoved),
                }),
              },
              {
                key: 'files',
                label: t('statistics.code.files'),
                value: formatCount(totals.agentFiles),
              },
              {
                key: 'share',
                label: t('statistics.code.agentShare'),
                value: formatPercent(shareOf(lines.agents, lines.total)),
              },
            ]}
          />
        </div>
        <RankedList
          title={t('statistics.code.languages')}
          emptyLabel={t('statistics.nothing')}
          rows={languageRows(report.languages, t('statistics.code.noExtension'))}
        />
      </div>
    </Section>
  )
}

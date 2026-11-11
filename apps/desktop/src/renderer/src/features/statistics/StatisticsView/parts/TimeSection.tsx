import { useTranslation } from 'react-i18next'

import { BarChart } from '@agentic-workstation/ui/BarChart'
import { Section } from '@agentic-workstation/ui/Section'

import { useHumanNote } from '../StatisticsView.hooks'
import styles from '../StatisticsView.module.scss'
import type { SectionProps } from '../StatisticsView.types'
import { formatDuration } from '../../statistics-format.utils'
import { timeUnitOf, barPointsOf, bucketLabelsOf } from '../../statistics-series.utils'
import { YOU_TONE, MINUTE_MS, AGENTS_TONE } from '../../statistics.constants'
import { FactGrid } from './FactGrid'
import { StatisticsHelp } from './StatisticsHelp'

/**
 * Время: присутствие человека и настенное время агентов по шагам рядом - видно, где агенты
 * работали, пока человека не было. Под графиком - сколько так набралось, сумма ходов
 * (параллельные складываются), настенное и доля оценки по транскриптам.
 */
export const TimeSection = ({ data, chart }: SectionProps) => {
  const { t } = useTranslation()
  const totals = data.report.totals
  const humanNote = useHumanNote(data.report)
  const labels = bucketLabelsOf(chart.bucket, (date) => t('statistics.week', { date }))
  // Часы дня - минутами, дни - часами: шкала круглая в своей единице.
  const unit = timeUnitOf(chart.bucket)
  const formatValue = (value: number) => formatDuration(value * unit)

  return (
    <Section
      title={t('statistics.time.title')}
      description={humanNote}
      help={<StatisticsHelp topic="time" />}>
      <div className={styles.stack}>
        <BarChart
          label={t('statistics.time.chart')}
          series={[
            { key: 'you', label: t('statistics.time.present'), tone: YOU_TONE },
            { key: 'agents', label: t('statistics.time.working'), tone: AGENTS_TONE },
          ]}
          points={barPointsOf(chart, labels, (point) => [
            (point.presenceMinutes * MINUTE_MS) / unit,
            (point.agentMinutes * MINUTE_MS) / unit,
          ])}
          formatValue={formatValue}
          emptyLabel={t('statistics.time.empty')}
        />
        <FactGrid
          facts={[
            {
              key: 'without',
              label: t('statistics.time.withoutYou'),
              value: formatDuration(totals.agentsWithoutYouMs),
            },
            {
              key: 'summed',
              label: t('statistics.time.summed'),
              value: formatDuration(totals.agentWorkMs),
            },
            {
              key: 'wall',
              label: t('statistics.time.wall'),
              value: formatDuration(totals.agentWallMs),
            },
            {
              key: 'estimated',
              label: t('statistics.time.estimated'),
              value: formatDuration(totals.agentWorkEstimatedMs),
            },
            {
              key: 'presence',
              label: t('statistics.time.presence'),
              value: formatDuration(totals.presenceMinutes * MINUTE_MS),
            },
          ]}
        />
      </div>
    </Section>
  )
}

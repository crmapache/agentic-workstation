import { useTranslation } from 'react-i18next'

import { MINUTE_MS } from '@shared/time-units'

import { CalendarHeatmap } from '@agentic-workstation/ui/CalendarHeatmap'
import { Section } from '@agentic-workstation/ui/Section'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import styles from '../StatisticsView.module.scss'
import type { SectionProps } from '../StatisticsView.types'
import { peakWhenOf, activeDaysOf, calendarMetricOf } from '../StatisticsView.utils'
import { formatCount, formatDuration } from '../../statistics-format.utils'
import { calendarDaysOf, calendarWeekdayLabels } from '../../statistics-series.utils'
import { YOU_TONE, AGENTS_TONE } from '../../statistics.constants'
import { useStatisticsStore } from '../../statistics.store'
import { FactGrid } from './FactGrid'
import { StatisticsHelp } from './StatisticsHelp'

/**
 * Когда работает человек: календарь за год (присутствие или токены - переключатель в шапке
 * раздела), фраза про дни и часы пика, серии дней и рабочие сессии периода.
 */
export const HabitsSection = ({ data }: Pick<SectionProps, 'data'>) => {
  const { t } = useTranslation()
  const chosen = useStatisticsStore((state) => state.calendar)
  const setCalendar = useStatisticsStore((state) => state.setCalendar)
  const { calendar, streaks, peak, workSessions } = data.report
  const metric = calendarMetricOf(chosen, calendar)
  const when = peakWhenOf(peak)
  const valueLabel =
    metric === 'presence'
      ? (minutes: number) => formatDuration(minutes * MINUTE_MS)
      : (tokens: number) => formatCount(tokens)

  return (
    <Section
      title={t('statistics.habits.title')}
      help={<StatisticsHelp topic="habits" />}
      actions={
        <Tabs
          label={t('statistics.habits.metric')}
          items={[
            { id: 'presence', label: t('statistics.habits.presence') },
            { id: 'tokens', label: t('statistics.habits.tokens') },
          ]}
          value={metric}
          onChange={setCalendar}
        />
      }>
      <div className={styles.stack}>
        <CalendarHeatmap
          label={t('statistics.habits.calendarLabel', {
            active: activeDaysOf(calendar),
            current: streaks.current,
            best: streaks.best,
          })}
          days={calendarDaysOf(calendar, metric, valueLabel)}
          seriesLabel={t(`statistics.habits.${metric}`)}
          tone={metric === 'presence' ? YOU_TONE : AGENTS_TONE}
          weekdayLabels={calendarWeekdayLabels()}
          lessLabel={t('statistics.habits.less')}
          moreLabel={t('statistics.habits.more')}
        />
        <p className={styles.sentence}>
          {when
            ? t(
                peak.basis === 'presence'
                  ? 'statistics.habits.peakPresence'
                  : 'statistics.habits.peakTokens',
                { when },
              )
            : t('statistics.habits.noPeak')}
        </p>
        <FactGrid
          facts={[
            {
              key: 'current',
              label: t('statistics.habits.currentStreak'),
              value: t('statistics.habits.days', { count: streaks.current }),
            },
            {
              key: 'best',
              label: t('statistics.habits.bestStreak'),
              value: t('statistics.habits.days', { count: streaks.best }),
            },
            {
              key: 'sessions',
              label: t('statistics.habits.workSessions'),
              value: formatCount(workSessions.count),
            },
            {
              key: 'average',
              label: t('statistics.habits.averageSession'),
              value: formatDuration(workSessions.averageMinutes * MINUTE_MS),
            },
            {
              key: 'longest',
              label: t('statistics.habits.longestSession'),
              value: formatDuration(workSessions.longestMinutes * MINUTE_MS),
            },
          ]}
        />
      </div>
    </Section>
  )
}

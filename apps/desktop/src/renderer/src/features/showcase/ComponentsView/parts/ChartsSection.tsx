import { useTranslation } from 'react-i18next'

import { CalendarHeatmap } from '@agentic-workstation/ui/CalendarHeatmap'

import {
  CALENDAR_WEEKDAYS,
  CALENDAR_SAMPLE_DAYS,
  CALENDAR_SPARSE_DAYS,
} from '../ComponentsView.constants'
import { ShowcaseSection } from '../../ShowcaseSection/ShowcaseSection'
import { Specimen } from '../../Specimen/Specimen'
import { BarChartSpecimens } from './BarChartSpecimens'
import { ChartTipSpecimen } from './ChartTipSpecimen'
import { ShareBarSpecimens } from './ShareBarSpecimens'

/**
 * Раздел «Графики»: столбцы, календарь активности, полоса долей и подсказка у метки. Тоны -
 * роли рядов --color-chart-*, их же видно на вкладке «Основа».
 */
export const ChartsSection = () => {
  const { t } = useTranslation('showcase')

  return (
    <ShowcaseSection title={t('sections.charts')}>
      <BarChartSpecimens />

      <Specimen wide label={t('specimens.calendarHeatmap')} layout="column">
        <CalendarHeatmap
          label={t('samples.calendarLabel')}
          days={CALENDAR_SAMPLE_DAYS}
          seriesLabel={t('samples.calendarPresence')}
          weekdayLabels={CALENDAR_WEEKDAYS}
          lessLabel={t('samples.calendarLess')}
          moreLabel={t('samples.calendarMore')}
        />
      </Specimen>

      <Specimen wide label={t('specimens.calendarHeatmapSparse')} layout="column">
        <CalendarHeatmap
          label={t('samples.calendarLabel')}
          days={CALENDAR_SPARSE_DAYS}
          seriesLabel={t('samples.chartTokens')}
          tone="chart2"
          weekdayLabels={CALENDAR_WEEKDAYS}
          lessLabel={t('samples.calendarLess')}
          moreLabel={t('samples.calendarMore')}
        />
      </Specimen>

      <ShareBarSpecimens />
      <ChartTipSpecimen />
    </ShowcaseSection>
  )
}

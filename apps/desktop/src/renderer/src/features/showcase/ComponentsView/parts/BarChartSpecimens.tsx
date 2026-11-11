import { useTranslation } from 'react-i18next'

import { BarChart } from '@agentic-workstation/ui/BarChart'

import {
  SAMPLE_NUMBERS,
  BAR_DAY_SAMPLES,
  BAR_HOUR_SAMPLES,
  BAR_EMPTY_SAMPLES,
} from '../ComponentsView.constants'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Образцы столбцового графика: один ряд с числом над самым высоким столбцом, два ряда рядом
 * и стопкой, пустой период. Наведи или пройди стрелками - подсказка с числами шага.
 */
export const BarChartSpecimens = () => {
  const { t } = useTranslation('showcase')
  const series = [
    { key: 'you', label: t('samples.chartYou'), tone: 'chart1' },
    { key: 'agents', label: t('samples.chartAgents'), tone: 'chart2' },
  ] as const
  const formatValue = (value: number) => SAMPLE_NUMBERS.format(value)

  return (
    <>
      <Specimen wide label={t('specimens.barChart')} layout="column">
        <BarChart
          label={t('samples.chartTokensLabel')}
          series={[{ key: 'tokens', label: t('samples.chartTokens'), tone: 'chart2' }]}
          points={BAR_HOUR_SAMPLES.map((point) => ({ ...point, note: t('samples.chartCostNote') }))}
          formatValue={formatValue}
          emptyLabel={t('samples.chartEmpty')}
          integer
        />
      </Specimen>
      <Specimen label={t('specimens.barChartGrouped')} layout="column">
        <BarChart
          label={t('samples.chartLinesLabel')}
          series={series}
          points={BAR_DAY_SAMPLES}
          formatValue={formatValue}
          emptyLabel={t('samples.chartEmpty')}
          integer
        />
      </Specimen>
      <Specimen label={t('specimens.barChartStacked')} layout="column">
        <BarChart
          label={t('samples.chartLinesLabel')}
          series={series}
          points={BAR_DAY_SAMPLES}
          layout="stacked"
          formatValue={formatValue}
          emptyLabel={t('samples.chartEmpty')}
          integer
        />
      </Specimen>
      <Specimen label={t('specimens.barChartEmpty')} layout="column">
        <BarChart
          label={t('samples.chartLinesLabel')}
          series={series}
          points={BAR_EMPTY_SAMPLES}
          formatValue={formatValue}
          emptyLabel={t('samples.chartEmpty')}
          integer
        />
      </Specimen>
    </>
  )
}

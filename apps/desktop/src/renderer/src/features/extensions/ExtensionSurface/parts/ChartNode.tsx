import { useTranslation } from 'react-i18next'

import { BarChart } from '@agentic-workstation/ui/BarChart'

import { CHART_TONES } from '../ExtensionSurface.constants'
import type { NodeProps } from '../ExtensionSurface.types'
import { chartValue } from '../ExtensionSurface.utils'

/** Столбцы - BarChart дизайн-системы: ряды тонами графиков IDE, числа - коротко. */
export const ChartNode = ({ node }: NodeProps<'chart'>) => {
  const { t } = useTranslation()

  return (
    <BarChart
      label={node.title}
      layout={node.layout ?? 'grouped'}
      series={node.series.map((series, index) => ({
        key: series.key,
        label: series.label,
        tone: CHART_TONES[index] ?? 'other',
      }))}
      points={node.points.map((point) => ({
        key: point.key,
        label: point.label,
        axisLabel: point.label,
        values: node.series.map((_series, index) => point.values[index] ?? 0),
      }))}
      formatValue={chartValue}
      emptyLabel={t('extensions.view.chartEmpty')}
    />
  )
}

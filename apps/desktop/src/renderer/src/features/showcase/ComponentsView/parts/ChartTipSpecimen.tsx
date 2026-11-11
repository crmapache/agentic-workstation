import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { ChartTip } from '@agentic-workstation/ui/ChartTip'
import { useChartTip, useMarkCursor } from '@agentic-workstation/ui/ChartTip.hooks'

import { CHART_TIP_STEPS } from '../ComponentsView.constants'
import styles from '../ComponentsView.module.scss'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Подсказка графика отдельно от графика: метка data-mark, рамка с указателем и стрелками,
 * подсказка встаёт к метке сразу, без задержки, и уходит вместе с указателем.
 */
export const ChartTipSpecimen = () => {
  const { t } = useTranslation('showcase')
  const frameRef = useRef<HTMLDivElement>(null)
  const { mark, handlers } = useMarkCursor(1, CHART_TIP_STEPS)
  const tipRef = useChartTip(frameRef, mark)

  return (
    <Specimen label={t('specimens.chartTip')}>
      <div ref={frameRef} tabIndex={0} className={styles.tipFrame} {...handlers}>
        <span data-mark={0} className={styles.tipMark}>
          {t('samples.chartTipHover')}
        </span>
      </div>
      <ChartTip
        tipRef={tipRef}
        title={t('samples.chartTipTitle')}
        rows={[
          { key: 'you', value: '12', label: t('samples.chartYou'), tone: 'chart1' },
          { key: 'agents', value: '340', label: t('samples.chartAgents'), tone: 'chart2' },
        ]}
        note={t('samples.chartCostNote')}
      />
    </Specimen>
  )
}

import { useRef } from 'react'
import clsx from 'clsx'

import { ChartTip } from '../ChartTip/ChartTip'
import { useChartTip, useMarkCursor } from '../ChartTip/ChartTip.hooks'
import { BAR_STEPS } from './BarChart.constants'
import styles from './BarChart.module.scss'
import type { BarChartProps } from './BarChart.types'
import { niceTop, maximaOf, tallestOf, axisAlignOf } from './BarChart.utils'
import { BarLegend } from './parts/BarLegend'
import { BarSlot } from './parts/BarSlot'
import { BarTable } from './parts/BarTable'
import { BarTicks } from './parts/BarTicks'

/**
 * Столбцы по шагам (часы, дни): один ряд или два - рядом (grouped) или стопкой (stacked).
 * Ось из трёх линий - верх круглым числом, половина, ноль; столбец не толще меры, лишнее
 * место - воздух. Рекорд ряда ярче, над самым высоким - его число. Под рукой или стрелками -
 * подсказка с числами шага. Для скринридера - картинка с подписью и таблица чисел.
 */
export const BarChart = ({
  label,
  series,
  points,
  layout = 'grouped',
  formatValue,
  emptyLabel,
  integer = false,
}: BarChartProps) => {
  const plotRef = useRef<HTMLDivElement>(null)
  const { mark, handlers } = useMarkCursor(points.length, BAR_STEPS)
  const tipRef = useChartTip(plotRef, mark)

  const maxima = maximaOf(points, series.length, layout)
  const top = niceTop(Math.max(0, ...maxima), integer)
  const empty = maxima.every((max) => max === 0)
  const tallest = tallestOf(points, layout)
  const active = mark === null ? undefined : points[mark]

  return (
    <figure className={styles.barChart}>
      {series.length > 1 && <BarLegend series={series} />}
      <div className={styles.frame}>
        <BarTicks top={top} empty={empty} formatValue={formatValue} />
        <div
          ref={plotRef}
          role="img"
          aria-label={label}
          tabIndex={0}
          className={styles.plot}
          {...handlers}>
          <span className={clsx(styles.line, styles.lineTop)} />
          <span className={clsx(styles.line, styles.lineHalf)} />
          <span className={clsx(styles.line, styles.lineZero)} />
          {empty ? (
            <span className={styles.empty}>{emptyLabel}</span>
          ) : (
            <div className={styles.bars}>
              {points.map((point, index) => (
                <BarSlot
                  key={point.key}
                  index={index}
                  point={point}
                  series={series}
                  layout={layout}
                  top={top}
                  maxima={maxima}
                  tallest={tallest}
                  active={index === mark}
                  formatValue={formatValue}
                />
              ))}
            </div>
          )}
        </div>
        <div className={styles.axis} aria-hidden>
          {points.map((point, index) => (
            <span
              key={point.key}
              className={clsx(styles.axisSlot, styles[axisAlignOf(index, points.length)])}>
              {point.axisLabel}
            </span>
          ))}
        </div>
      </div>
      <BarTable label={label} series={series} points={points} formatValue={formatValue} />
      <ChartTip
        tipRef={tipRef}
        title={active?.label ?? ''}
        rows={series.map((item, index) => ({
          key: item.key,
          value: formatValue(active?.values[index] ?? 0),
          label: item.label,
          tone: item.tone,
        }))}
        note={active?.note}
      />
    </figure>
  )
}

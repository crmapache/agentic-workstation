import { useRef, useLayoutEffect } from 'react'
import clsx from 'clsx'

import { ChartTip } from '../ChartTip/ChartTip'
import { useChartTip, useMarkCursor } from '../ChartTip/ChartTip.hooks'
import { HEAT_LEVELS, CALENDAR_STEPS } from './CalendarHeatmap.constants'
import styles from './CalendarHeatmap.module.scss'
import type { CalendarHeatmapProps } from './CalendarHeatmap.types'
import { monthRow, heatLevels } from './CalendarHeatmap.utils'

/**
 * Календарь активности за год, как у GitHub: столбец - неделя с понедельника, клетка -
 * день, тон - насколько день занят (пять ступеней одного тона, пустой день - подложкой).
 * Свежая неделя - у правого края: в узком месте за левый край уходят самые старые. Под
 * рукой или стрелками - подсказка с днём и числом; для скринридера - одна фраза о годе.
 */
export const CalendarHeatmap = ({
  label,
  days,
  seriesLabel,
  tone = 'chart1',
  weekdayLabels,
  lessLabel,
  moreLabel,
}: CalendarHeatmapProps) => {
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { mark, handlers } = useMarkCursor(days.length, CALENDAR_STEPS)
  const tipRef = useChartTip(gridRef, mark)

  useLayoutEffect(() => {
    const scroll = scrollRef.current

    if (scroll) scroll.scrollLeft = scroll.scrollWidth
  }, [days.length])

  const levels = heatLevels(days.map((day) => day.value))
  const active = mark === null ? undefined : days[mark]

  return (
    <figure className={clsx(styles.calendarHeatmap, styles[tone])}>
      <div className={styles.calendar}>
        <div className={styles.weekdays} aria-hidden>
          <span className={styles.month} />
          {weekdayLabels.map((weekday, index) => (
            <span key={index} className={styles.weekday}>
              {weekday}
            </span>
          ))}
        </div>
        <div ref={scrollRef} className={styles.scroll}>
          <div className={styles.months} aria-hidden>
            {monthRow(days).map((month, week) => (
              <span key={week} className={styles.month}>
                {month}
              </span>
            ))}
          </div>
          <div
            ref={gridRef}
            role="img"
            aria-label={label}
            tabIndex={0}
            className={styles.grid}
            {...handlers}>
            {days.map((day, index) => (
              <span
                key={day.key}
                data-mark={index}
                className={clsx(
                  styles.cell,
                  styles[`level${levels[index] ?? 0}`],
                  index === mark && styles.active,
                )}
              />
            ))}
          </div>
        </div>
      </div>
      <div className={styles.legend} aria-hidden>
        {lessLabel}
        {HEAT_LEVELS.map((level) => (
          <span key={level} className={clsx(styles.cell, styles[`level${level}`])} />
        ))}
        {moreLabel}
      </div>
      <ChartTip
        tipRef={tipRef}
        title={active?.label ?? ''}
        rows={[{ key: 'value', value: active?.valueLabel ?? '', label: seriesLabel, tone }]}
      />
    </figure>
  )
}

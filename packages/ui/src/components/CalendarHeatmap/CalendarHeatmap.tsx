import { useRef } from 'react'
import clsx from 'clsx'

import { ChartTip } from '../ChartTip/ChartTip'
import { useChartTip, useMarkCursor } from '../ChartTip/ChartTip.hooks'
import { WEEK_DAYS, HEAT_LEVELS, CALENDAR_STEPS } from './CalendarHeatmap.constants'
import { useFittedWeeks } from './CalendarHeatmap.hooks'
import styles from './CalendarHeatmap.module.scss'
import type { CalendarHeatmapProps } from './CalendarHeatmap.types'
import { monthRow, heatLevels } from './CalendarHeatmap.utils'

/**
 * Календарь активности за год, как у GitHub: столбец - неделя с понедельника, клетка -
 * день, тон - насколько день занят (пять ступеней одного тона, пустой день - подложкой).
 * Недели делят всю ширину, клетки квадратные; свежая неделя - у правого края, а в узком
 * месте самые старые уходят слева - без прокрутки. Под рукой или стрелками - подсказка с
 * днём и числом; для скринридера - одна фраза о годе.
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
  const weeksRef = useRef<HTMLDivElement>(null)
  const weeks = useFittedWeeks(weeksRef, gridRef, Math.ceil(days.length / WEEK_DAYS))
  // Ступени - по всему году: узкое место прячет старые недели, но не меняет тон свежих.
  const allLevels = heatLevels(days.map((day) => day.value))
  const from = Math.max(0, Math.ceil(days.length / WEEK_DAYS) - weeks) * WEEK_DAYS
  const shown = days.slice(from)
  const levels = allLevels.slice(from)
  const { mark, handlers } = useMarkCursor(shown.length, CALENDAR_STEPS)
  const tipRef = useChartTip(gridRef, mark)
  const active = mark === null ? undefined : shown[mark]

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
        <div ref={weeksRef} className={styles.weeks}>
          <div className={styles.months} aria-hidden>
            {monthRow(shown).map((month, week) => (
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
            {shown.map((day, index) => (
              <span
                key={day.key}
                data-mark={index}
                className={clsx(
                  styles.cell,
                  styles.day,
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

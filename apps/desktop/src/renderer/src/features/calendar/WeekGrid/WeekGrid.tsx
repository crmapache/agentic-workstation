import { useRef } from 'react'
import { clsx } from 'clsx'

import { isWorkDay } from '@shared/calendar-settings'

import { blocksOn, startOfDay, weekdayLabel } from '../calendar.utils'
import { clockOfMinutes } from '../../../lib/dates.utils'
import { HOURS } from './WeekGrid.constants'
import { useScrollToMorning } from './WeekGrid.hooks'
import styles from './WeekGrid.module.scss'
import type { WeekGridProps } from './WeekGrid.types'
import { AllDayRow } from './parts/AllDayRow'
import { DayColumn } from './parts/DayColumn'

/**
 * Сетка недели или дня: шапка дней, полоса «весь день», часы и колонки дней со встречами.
 * Рабочее время рабочих дней светлее, выходные дни темнее целиком. Пересекающиеся встречи
 * делят колонку, накладка - красной обводкой и зоной общего времени внутри самой встречи.
 */
export const WeekGrid = ({
  period,
  meetings,
  overlaps,
  sources,
  settings,
  now,
  onOpen,
}: WeekGridProps) => {
  const scroller = useRef<HTMLDivElement>(null)
  const today = startOfDay(now)
  const colorOf = (sourceId: string) => sources.find((source) => source.id === sourceId)?.color ?? 0
  const isDayOff = (day: number) => !isWorkDay(settings, day)

  useScrollToMorning(scroller, settings.workHours.from)

  return (
    <div className={clsx(styles.grid, period.days.length === 1 && styles.single)}>
      <div className={styles.head}>
        <span className={styles.gutter} />
        {period.days.map((day) => (
          <span
            key={day}
            className={clsx(
              styles.dayName,
              isDayOff(day) && styles.dayOff,
              day === today && styles.today,
            )}>
            <span className={styles.weekday}>{weekdayLabel(day)}</span>
            <span className={styles.weekdayNarrow}>{weekdayLabel(day).slice(0, 1)}</span>
            <span className={styles.dayNumber}>{new Date(day).getDate()}</span>
          </span>
        ))}
      </div>
      <AllDayRow
        days={period.days}
        meetings={meetings}
        now={now}
        colorOf={colorOf}
        isDayOff={isDayOff}
        onOpen={onOpen}
      />
      <div ref={scroller} className={styles.scroller}>
        <div className={styles.body}>
          <div className={styles.hours} aria-hidden>
            {HOURS.map((hour) => (
              <span key={hour} className={styles.hour}>
                {hour > 0 && <span className={styles.hourLabel}>{clockOfMinutes(hour * 60)}</span>}
              </span>
            ))}
          </div>
          {period.days.map((day) => (
            <DayColumn
              key={day}
              blocks={blocksOn(meetings, overlaps, day)}
              work={isDayOff(day) ? null : settings.workHours}
              nowMinute={day === today ? Math.floor((now - day) / 60_000) : null}
              now={now}
              colorOf={colorOf}
              onOpen={onOpen}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

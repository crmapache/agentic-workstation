import { useRef, useState } from 'react'
import { clsx } from 'clsx'

import { bandsOn, blocksOn, startOfDay, weekdayLabel } from '../calendar.utils'
import { EventCard } from '../EventCard/EventCard'
import { clockOfMinutes } from '../../../lib/dates.utils'
import { HOURS } from './WeekGrid.constants'
import { useScrollToMorning } from './WeekGrid.hooks'
import styles from './WeekGrid.module.scss'
import type { OpenedMeeting, WeekGridProps } from './WeekGrid.types'
import { AllDayRow } from './parts/AllDayRow'
import { DayColumn } from './parts/DayColumn'

/**
 * Сетка недели или дня: шапка дней, полоса «весь день», часы и колонки дней со встречами.
 * Пересекающиеся встречи делят колонку, накладка - красной обводкой и полосой общего времени.
 * Нажатая встреча открывает карточку рядом с собой.
 */
export const WeekGrid = ({ period, meetings, overlaps, sources, now }: WeekGridProps) => {
  const scroller = useRef<HTMLDivElement>(null)
  const [opened, setOpened] = useState<OpenedMeeting | null>(null)
  const today = startOfDay(now)
  const colorOf = (sourceId: string) => sources.find((source) => source.id === sourceId)?.color ?? 0

  useScrollToMorning(scroller)

  return (
    <div className={clsx(styles.grid, period.days.length === 1 && styles.single)}>
      <div className={styles.head}>
        <span className={styles.gutter} />
        {period.days.map((day) => (
          <span key={day} className={clsx(styles.dayName, day === today && styles.today)}>
            <span className={styles.weekday}>{weekdayLabel(day)}</span>
            <span className={styles.weekdayNarrow}>{weekdayLabel(day).slice(0, 1)}</span>
            <span className={styles.dayNumber}>{new Date(day).getDate()}</span>
          </span>
        ))}
      </div>
      <AllDayRow days={period.days} meetings={meetings} colorOf={colorOf} onOpen={setOpened} />
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
              bands={bandsOn(overlaps, day)}
              nowMinute={day === today ? Math.floor((now - day) / 60_000) : null}
              colorOf={colorOf}
              onOpen={setOpened}
            />
          ))}
        </div>
      </div>
      {opened && (
        <EventCard
          opened={opened}
          overlaps={overlaps}
          meetings={meetings}
          sources={sources}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  )
}

import { useState } from 'react'

import styles from '../CalendarView.module.scss'
import type { CalendarBodyProps } from '../CalendarView.types'
import { useCalendarStore } from '../../calendar.store'
import { EventCard } from '../../EventCard/EventCard'
import { MonthGrid } from '../../MonthGrid/MonthGrid'
import { WeekGrid } from '../../WeekGrid/WeekGrid'
import type { OpenedMeeting } from '../../WeekGrid/WeekGrid.types'

/**
 * Сетка периода - неделя и день часами, месяц клетками - и карточка нажатой встречи рядом с её
 * блоком. Горят только непросмотренные накладки (active), карточка знает и просмотренные. Уже
 * наименьшей ширины сетка не сжимается, а прокручивается вбок.
 */
export const CalendarBody = ({
  period,
  meetings,
  overlaps,
  active,
  state,
  now,
}: CalendarBodyProps) => {
  const mode = useCalendarStore((store) => store.mode)
  const [opened, setOpened] = useState<OpenedMeeting | null>(null)
  const grid = { period, meetings, overlaps: active, sources: state.sources, now }

  return (
    <div className={styles.body}>
      {mode === 'month' ? (
        <MonthGrid {...grid} settings={state.settings} onOpen={setOpened} />
      ) : (
        <WeekGrid {...grid} settings={state.settings} onOpen={setOpened} />
      )}
      {opened && (
        <EventCard
          opened={opened}
          overlaps={overlaps}
          seen={state.seenOverlaps}
          meetings={meetings}
          sources={state.sources}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  )
}

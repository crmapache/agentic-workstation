import { clsx } from 'clsx'

import { isWorkDay } from '@shared/calendar-settings'

import { WEEK_DAYS } from '../calendar.constants'
import { startOfDay, weekdayLabel } from '../calendar.utils'
import styles from './MonthGrid.module.scss'
import type { MonthGridProps } from './MonthGrid.types'
import { clashingKeys, meetingsOnDay } from './MonthGrid.utils'
import { MonthCell } from './parts/MonthCell'

/**
 * Месяц клетками: шесть недель с понедельника, дни чужого месяца тише, выходные темнее. В клетке
 * - встречи дня по времени (накладка - красной обводкой), не влезли - «ещё N»; день и «ещё»
 * открывают этот день целиком.
 */
export const MonthGrid = ({
  period,
  meetings,
  overlaps,
  sources,
  settings,
  now,
  onOpen,
}: MonthGridProps) => {
  const today = startOfDay(now)
  const clashing = clashingKeys(overlaps)
  const month = new Date(period.month).getMonth()
  const colorOf = (sourceId: string) => sources.find((source) => source.id === sourceId)?.color ?? 0

  return (
    <div className={styles.month}>
      <div className={styles.head}>
        {period.days.slice(0, WEEK_DAYS).map((day) => (
          <span
            key={day}
            className={clsx(styles.weekday, !isWorkDay(settings, day) && styles.dayOff)}>
            {weekdayLabel(day)}
          </span>
        ))}
      </div>
      <div className={styles.cells}>
        {period.days.map((day) => (
          <MonthCell
            key={day}
            day={day}
            meetings={meetingsOnDay(meetings, day)}
            clashing={clashing}
            isToday={day === today}
            isOtherMonth={new Date(day).getMonth() !== month}
            isDayOff={!isWorkDay(settings, day)}
            colorOf={colorOf}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  )
}

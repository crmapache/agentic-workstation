import { clsx } from 'clsx'
import { useTranslation } from 'react-i18next'

import styles from '../MonthGrid.module.scss'
import type { MonthCellProps } from '../MonthGrid.types'
import { MONTH_CELL_EVENTS } from '../../calendar.constants'
import { useCalendarStore } from '../../calendar.store'
import { clockLabel, fullDayLabel } from '../../../../lib/dates.utils'

/**
 * День месяца: число (открывает день целиком), встречи временем и названием, «ещё N» за
 * пределом клетки. Встреча открывает свою карточку, как на неделе.
 */
export const MonthCell = ({
  day,
  meetings,
  clashing,
  isToday,
  isOtherMonth,
  isDayOff,
  colorOf,
  onOpen,
}: MonthCellProps) => {
  const { t } = useTranslation()
  const setMode = useCalendarStore((store) => store.setMode)
  const setAnchor = useCalendarStore((store) => store.setAnchor)
  const shown = meetings.slice(0, MONTH_CELL_EVENTS)
  const more = meetings.length - shown.length

  const handleDay = () => {
    setAnchor(day)
    setMode('day')
  }

  return (
    <div className={clsx(styles.cell, isDayOff && styles.dayOff, isOtherMonth && styles.other)}>
      <button
        type="button"
        className={clsx(styles.number, isToday && styles.today)}
        aria-label={t('calendar.month.openDay', { day: fullDayLabel(day) })}
        onClick={handleDay}>
        {new Date(day).getDate()}
      </button>
      {shown.map((meeting) => (
        <button
          key={meeting.key}
          type="button"
          className={clsx(
            styles.chip,
            styles[`tone${colorOf(meeting.sourceIds[0] ?? '')}`],
            meeting.event.allDay && styles.allDay,
            clashing.has(meeting.key) &&
              (clashing.get(meeting.key) === true ? styles.softClash : styles.clash),
          )}
          onClick={(click) => onOpen({ meeting, anchor: click.currentTarget })}>
          {!meeting.event.allDay && (
            <span className={styles.chipTime}>{clockLabel(meeting.event.start)}</span>
          )}
          <span className={styles.chipTitle}>
            {meeting.event.title || t('calendar.event.noTitle')}
          </span>
        </button>
      ))}
      {more > 0 && (
        <button type="button" className={styles.more} onClick={handleDay}>
          {t('calendar.month.more', { count: more })}
        </button>
      )}
    </div>
  )
}

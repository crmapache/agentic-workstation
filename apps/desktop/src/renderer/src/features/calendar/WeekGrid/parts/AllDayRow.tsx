import { clsx } from 'clsx'
import { useTranslation } from 'react-i18next'

import styles from '../WeekGrid.module.scss'
import type { AllDayRowProps } from '../WeekGrid.types'
import { allDayOn, isPastMeeting } from '../../calendar.utils'

/** Полоса «весь день» над часами: отпуск, праздник, поездка - плашками по дням, прошедшие тише. */
export const AllDayRow = ({ days, meetings, now, colorOf, isDayOff, onOpen }: AllDayRowProps) => {
  const { t } = useTranslation()
  const perDay = days.map((day) => allDayOn(meetings, day))

  if (perDay.every((list) => list.length === 0)) return null

  return (
    <div className={styles.allDay}>
      <span className={styles.gutterLabel}>{t('calendar.grid.allDay')}</span>
      {days.map((day, index) => (
        <div key={day} className={clsx(styles.allDayCell, isDayOff(day) && styles.dayOff)}>
          {(perDay[index] ?? []).map((meeting) => (
            <button
              key={meeting.key}
              type="button"
              className={clsx(
                styles.chip,
                styles[`tone${colorOf(meeting.sourceIds[0] ?? '')}`],
                isPastMeeting(meeting, now) && styles.pastChip,
              )}
              onClick={(click) => onOpen({ meeting, anchor: click.currentTarget })}>
              {meeting.event.title || t('calendar.event.noTitle')}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

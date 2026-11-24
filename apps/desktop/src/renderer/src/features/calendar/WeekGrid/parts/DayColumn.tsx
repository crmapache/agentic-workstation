import { clsx } from 'clsx'

import { HOURS } from '../WeekGrid.constants'
import styles from '../WeekGrid.module.scss'
import type { DayColumnProps } from '../WeekGrid.types'
import { nowStyle, workStyle } from '../WeekGrid.utils'
import { isPastMeeting } from '../../calendar.utils'
import { EventBlock } from './EventBlock'

/**
 * Колонка дня: линии часов, рабочее время подложкой светлее (у выходного вся колонка темнее),
 * встречи (прошедшие тише) и линия «сейчас».
 */
export const DayColumn = ({ blocks, work, nowMinute, now, colorOf, onOpen }: DayColumnProps) => (
  <div className={clsx(styles.day, !work && styles.dayOff)}>
    {HOURS.map((hour) => (
      <span key={hour} className={styles.line} />
    ))}
    {work && (
      <span
        className={styles.work}
        // eslint-disable-next-line no-restricted-syntax -- рабочее время задаёт человек в настройках
        style={workStyle(work)}
      />
    )}
    {blocks.map((block) => (
      <EventBlock
        key={block.meeting.key}
        block={block}
        past={isPastMeeting(block.meeting, now)}
        colorOf={colorOf}
        onOpen={onOpen}
      />
    ))}
    {nowMinute !== null && (
      <span
        className={styles.now}
        // eslint-disable-next-line no-restricted-syntax -- линия «сейчас» идёт с часами
        style={nowStyle(nowMinute)}
      />
    )}
  </div>
)

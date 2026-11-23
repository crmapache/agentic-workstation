import { clsx } from 'clsx'

import { HOURS } from '../WeekGrid.constants'
import styles from '../WeekGrid.module.scss'
import type { DayColumnProps } from '../WeekGrid.types'
import { nowStyle, bandStyle } from '../WeekGrid.utils'
import { EventBlock } from './EventBlock'

/** Колонка дня: линии часов, полосы общего времени накладок, встречи и линия «сейчас». */
export const DayColumn = ({ blocks, bands, nowMinute, colorOf, onOpen }: DayColumnProps) => (
  <div className={styles.day}>
    {HOURS.map((hour) => (
      <span key={hour} className={styles.line} />
    ))}
    {bands.map((band) => (
      <span
        key={`${band.startMinute}-${band.endMinute}`}
        className={clsx(styles.band, band.soft && styles.soft)}
        // eslint-disable-next-line no-restricted-syntax -- место полосы зависит от времени накладки
        style={bandStyle(band)}
      />
    ))}
    {blocks.map((block) => (
      <EventBlock key={block.meeting.key} block={block} colorOf={colorOf} onOpen={onOpen} />
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

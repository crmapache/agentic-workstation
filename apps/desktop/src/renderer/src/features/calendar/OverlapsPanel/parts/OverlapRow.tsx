import { clsx } from 'clsx'
import { useTranslation } from 'react-i18next'

import styles from '../OverlapsPanel.module.scss'
import type { OverlapRowProps } from '../OverlapsPanel.types'
import { useCalendarStore } from '../../calendar.store'
import { startOfDay } from '../../calendar.utils'
import { OverlapActions } from '../../OverlapActions/OverlapActions'
import { clockLabel, weekdayDayLabel } from '../../../../lib/dates.utils'
import { MeetingLine } from './MeetingLine'

/**
 * Накладка в списке: общее время и обе встречи - нажатие листает сетку к её дню; справа -
 * «видел» и «Ask AI».
 */
export const OverlapRow = ({ overlap, sources, withDay = false }: OverlapRowProps) => {
  const { t } = useTranslation()
  const setAnchor = useCalendarStore((store) => store.setAnchor)
  const span = `${clockLabel(overlap.start)} - ${clockLabel(overlap.end)}`

  return (
    <li
      className={clsx(styles.row, overlap.soft && styles.softRow, overlap.seen && styles.seenRow)}>
      <button
        type="button"
        className={styles.jump}
        aria-label={t('calendar.overlaps.show', { time: span })}
        onClick={() => setAnchor(startOfDay(overlap.start))}>
        <span className={clsx(styles.span, overlap.soft && styles.soft)}>
          {withDay ? `${weekdayDayLabel(overlap.start)}, ${span}` : span}
          {overlap.soft && ` · ${t('calendar.overlaps.soft')}`}
        </span>
        <MeetingLine meeting={overlap.a} sources={sources} />
        <MeetingLine meeting={overlap.b} sources={sources} />
      </button>
      <OverlapActions overlapKey={overlap.key} seen={overlap.seen} compact />
    </li>
  )
}

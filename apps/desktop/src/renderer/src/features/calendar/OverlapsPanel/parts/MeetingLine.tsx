import { clsx } from 'clsx'
import { useTranslation } from 'react-i18next'

import styles from '../OverlapsPanel.module.scss'
import type { MeetingLineProps } from '../OverlapsPanel.types'
import { clockLabel } from '../../../../lib/dates.utils'

/** Встреча накладки строкой: точка цвета её календаря, название и время целиком. */
export const MeetingLine = ({ meeting, sources }: MeetingLineProps) => {
  const { t } = useTranslation()
  const { event, sourceIds } = meeting
  const color = sources.find((source) => source.id === sourceIds[0])?.color ?? 0

  return (
    <span className={styles.meeting}>
      <span className={clsx(styles.dot, styles[`tone${color}`])} />
      <span className={styles.meetingTitle}>{event.title || t('calendar.event.noTitle')}</span>
      <span className={styles.meetingTime}>
        {`${clockLabel(event.start)} - ${clockLabel(event.end)}`}
      </span>
    </span>
  )
}

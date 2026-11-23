import { clsx } from 'clsx'
import { useTranslation } from 'react-i18next'

import styles from '../WeekGrid.module.scss'
import type { EventBlockProps } from '../WeekGrid.types'
import { blockStyle } from '../WeekGrid.utils'
import { COMPACT_BLOCK_MINUTES } from '../../calendar.constants'
import { clockLabel } from '../../../../lib/dates.utils'

/**
 * Встреча на сетке: цвет главного источника, точки остальных (дубль из второго календаря),
 * название и время. Накладка - красной обводкой, мягкая - жёлтой; отменённая и отклонённая -
 * тише, под вопросом - пунктиром.
 */
export const EventBlock = ({ block, colorOf, onOpen }: EventBlockProps) => {
  const { t } = useTranslation()
  const { event, sourceIds } = block.meeting
  const title = event.title || t('calendar.event.noTitle')
  const time = `${clockLabel(event.start)} - ${clockLabel(event.end)}`
  const faded = event.status === 'cancelled' || event.response === 'declined'
  const doubtful = event.status === 'tentative' || event.response === 'tentative'

  return (
    <button
      type="button"
      className={clsx(
        styles.block,
        styles[`tone${colorOf(sourceIds[0] ?? '')}`],
        block.clashing && (block.soft ? styles.softClash : styles.clash),
        faded && styles.faded,
        doubtful && styles.doubtful,
        block.endMinute - block.startMinute < COMPACT_BLOCK_MINUTES && styles.compact,
      )}
      // eslint-disable-next-line no-restricted-syntax -- место встречи зависит от её времени и соседей
      style={blockStyle(block)}
      aria-label={t(block.clashing ? 'calendar.event.labelClash' : 'calendar.event.label', {
        title,
        time,
      })}
      onClick={(click) => onOpen({ meeting: block.meeting, anchor: click.currentTarget })}>
      <span className={styles.blockTitle}>{title}</span>
      <span className={styles.blockTime}>{time}</span>
      {sourceIds.length > 1 && (
        <span className={styles.twins}>
          {sourceIds.slice(1).map((id) => (
            <span key={id} className={clsx(styles.dot, styles[`tone${colorOf(id)}`])} />
          ))}
        </span>
      )}
    </button>
  )
}

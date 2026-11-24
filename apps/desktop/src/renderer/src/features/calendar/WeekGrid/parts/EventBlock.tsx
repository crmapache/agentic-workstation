import { clsx } from 'clsx'
import { CircleQuestionMark } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import styles from '../WeekGrid.module.scss'
import type { EventBlockProps } from '../WeekGrid.types'
import { zoneStyle, blockStyle, statusTagOf } from '../WeekGrid.utils'
import { COMPACT_BLOCK_MINUTES } from '../../calendar.constants'
import { clockLabel } from '../../../../lib/dates.utils'

/**
 * Встреча на сетке: цвет главного источника, точки остальных (дубль из второго календаря),
 * название и время. Накладка - красной обводкой (мягкая - жёлтой) и зоной общего времени
 * внутри блока. Под вопросом - пунктиром со знаком вопроса и словом, отменённая и отклонённая -
 * тише и тоже со словом: одна рамка без подписи ничего не объясняет. Прошедшая - приглушена.
 */
export const EventBlock = ({ block, past, colorOf, onOpen }: EventBlockProps) => {
  const { t } = useTranslation()
  const { event, sourceIds } = block.meeting
  const title = event.title || t('calendar.event.noTitle')
  const time = `${clockLabel(event.start)} - ${clockLabel(event.end)}`
  const tag = statusTagOf(event)
  const tagText = tag ? t(`calendar.event.tags.${tag}`) : ''

  return (
    <button
      type="button"
      className={clsx(
        styles.block,
        styles[`tone${colorOf(sourceIds[0] ?? '')}`],
        past && styles.past,
        block.clashing && (block.soft ? styles.softClash : styles.clash),
        (tag === 'cancelled' || tag === 'declined') && styles.faded,
        tag === 'tentative' && styles.doubtful,
        block.endMinute - block.startMinute < COMPACT_BLOCK_MINUTES && styles.compact,
      )}
      // eslint-disable-next-line no-restricted-syntax -- место встречи зависит от её времени и соседей
      style={blockStyle(block)}
      aria-label={[
        t(block.clashing ? 'calendar.event.labelClash' : 'calendar.event.label', { title, time }),
        tagText,
      ]
        .filter(Boolean)
        .join(', ')}
      onClick={(click) => onOpen({ meeting: block.meeting, anchor: click.currentTarget })}>
      {block.zones.map((zone) => (
        <span
          key={`${zone.top}-${zone.height}`}
          className={clsx(styles.zone, zone.soft && styles.softZone)}
          // eslint-disable-next-line no-restricted-syntax -- зона накладки зависит от времени встреч
          style={zoneStyle(zone)}
        />
      ))}
      <span className={styles.blockTitle}>
        {tag === 'tentative' && <CircleQuestionMark className={styles.tagIcon} aria-hidden />}
        <span className={styles.blockName}>{title}</span>
      </span>
      <span className={styles.blockTime}>{tag ? `${time} · ${tagText}` : time}</span>
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

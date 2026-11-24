import { clsx } from 'clsx'
import { TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import styles from '../EventCard.module.scss'
import type { ClashAlertProps } from '../EventCard.types'
import { OverlapActions } from '../../OverlapActions/OverlapActions'
import { clockLabel } from '../../../../lib/dates.utils'

/**
 * Накладка в карточке: с какой встречей и в какое время - значок ровно по первой строке, под
 * текстом «видел» и «Ask AI». Просмотренная - спокойным тоном и с «снова подсвечивать».
 */
export const ClashAlert = ({ overlap, meeting, seen, source }: ClashAlertProps) => {
  const { t } = useTranslation()

  return (
    <div className={clsx(styles.clash, seen && styles.clashSeen, overlap.soft && styles.clashSoft)}>
      <span className={styles.clashIcon} aria-hidden>
        <TriangleAlert />
      </span>
      <div className={styles.clashText}>
        <span>
          {t(seen ? 'calendar.event.clashSeen' : 'calendar.event.clash', {
            title: meeting.event.title || t('calendar.event.noTitle'),
          })}
        </span>
        <span className={styles.clashMeta}>
          {[source, `${clockLabel(overlap.start)} - ${clockLabel(overlap.end)}`]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <div className={styles.clashActions}>
        <OverlapActions overlapKey={overlap.key} seen={seen} />
      </div>
    </div>
  )
}

import clsx from 'clsx'
import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ROW_ICON_SIZE } from '../LibraryTab.constants'
import styles from '../LibraryTab.module.scss'
import type { ShelfHoursProps } from '../LibraryTab.types'
import { whenLabel } from '../../scenarios-hours.utils'
import { hoursNote, comingHours } from '../../scenarios-shelves-facts.utils'

/**
 * Часы сценария своей колонкой справа: сколько их (или какой пропущен) и два ближайших срока.
 * Счёт, срок и пропуск одной строкой в узком виде переносились на три, а полка, где одна
 * строка в три этажа, читается сломанной.
 */
export const ShelfHours = ({ hours }: ShelfHoursProps) => {
  const { t } = useTranslation()
  const note = hoursNote(hours)

  if (!note) return null

  const soon = comingHours(hours).map((at, index) =>
    index === 0
      ? t('scenarios.library.next', { when: whenLabel(at) })
      : t('scenarios.library.then', { when: whenLabel(at) }),
  )

  return (
    <span className={styles.hours}>
      <span className={clsx(styles.hoursTop, note.missed !== null && styles.hoursMissed)}>
        <Clock size={ROW_ICON_SIZE} aria-hidden />
        {note.missed !== null
          ? t('scenarios.library.missed', { when: whenLabel(note.missed) })
          : t('scenarios.library.scheduled', { count: note.count })}
      </span>
      {soon.length > 0 && <span className={styles.hoursNext}>{soon.join(' · ')}</span>}
    </span>
  )
}

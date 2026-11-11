import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'

import { ROW_CHEVRON_SIZE } from './ListRow.constants'
import styles from './ListRow.module.scss'
import type { ListRowProps } from './ListRow.types'

/**
 * Строка списка под палец: не ниже цели касания, нажимается вся. Без onClick - просто строка
 * сведений (элемент очереди, у которого свои кнопки ниже).
 */
export const ListRow = ({
  title,
  description,
  leading,
  trailing,
  onClick,
  muted,
}: ListRowProps) => {
  const content = (
    <>
      {leading && <span className={styles.leading}>{leading}</span>}
      <span className={styles.texts}>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.description}>{description}</span>}
      </span>
      {trailing && <span className={styles.trailing}>{trailing}</span>}
    </>
  )

  if (!onClick) {
    return (
      <div role="listitem" className={clsx(styles.row, muted && styles.muted)}>
        {content}
      </div>
    )
  }

  return (
    <div role="listitem">
      <button
        type="button"
        className={clsx(styles.row, styles.pressable, muted && styles.muted)}
        onClick={onClick}>
        {content}
        <ChevronRight className={styles.chevron} size={ROW_CHEVRON_SIZE} aria-hidden />
      </button>
    </div>
  )
}

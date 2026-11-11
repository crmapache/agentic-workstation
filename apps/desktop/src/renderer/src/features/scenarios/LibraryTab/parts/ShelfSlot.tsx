import clsx from 'clsx'

import styles from '../LibraryTab.module.scss'
import type { ShelfSlotProps } from '../LibraryTab.types'

/**
 * Пустое место ростом с несомую строку: куда она ляжет (рамкой акцента) или пустая полка
 * посреди жеста. Рост ровно её: место, уехавшее на другую полку, оставляет и занимает одно и то
 * же, и граница полок под рукой не двигается.
 */
export const ShelfSlot = ({ height, target }: ShelfSlotProps) => (
  <div
    className={clsx(styles.slot, target && styles.slotTarget)}
    // eslint-disable-next-line no-restricted-syntax -- рост несомой строки известен только в жесте
    style={{ height }}
    aria-hidden
  />
)

import styles from '../EventCard.module.scss'
import type { FactRowProps } from '../EventCard.types'

/**
 * Строка карточки: значок слева ровно по первой строке текста, текст справа переносится под
 * себя, а не под значок. Подпись строки - для скринридера.
 */
export const FactRow = ({ icon: Icon, label, children }: FactRowProps) => (
  <li className={styles.fact} aria-label={label}>
    <span className={styles.factIcon} aria-hidden>
      <Icon />
    </span>
    <div className={styles.factText}>{children}</div>
  </li>
)

import styles from '../ExtensionSurface.module.scss'
import type { ListRowBodyProps } from '../ExtensionSurface.types'

/** Содержимое строки списка: одно и то же у нажимаемой строки и у простой. */
export const ListRowBody = ({ icon: Icon, title, description, badge }: ListRowBodyProps) => (
  <>
    {Icon && <Icon className={styles.listIcon} aria-hidden="true" />}
    <span className={styles.listText}>
      <span className={styles.listTitle}>{title}</span>
      {description && <span className={styles.listDescription}>{description}</span>}
    </span>
    {badge}
  </>
)

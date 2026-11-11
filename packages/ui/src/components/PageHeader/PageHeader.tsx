import { IconPlaque } from '../IconPlaque/IconPlaque'
import styles from './PageHeader.module.scss'
import type { PageHeaderProps } from './PageHeader.types'

/**
 * Шапка вида в середине окна (Connectors, позже статистика): полоса над прокруткой со
 * своей подложкой и линией снизу - иконка вида, заголовок, справа действия и «?» с
 * пояснением у самого края. Пояснения абзацем нет: текст в интерфейсе не копится. Не
 * уезжает с прокруткой.
 * Разделы под ней - Section.
 */
export const PageHeader = ({ icon, iconTone, title, help, actions }: PageHeaderProps) => (
  <header className={styles.pageHeader}>
    {icon && <IconPlaque icon={icon} tone={iconTone} />}
    <h1 className={styles.title}>{title}</h1>
    {(actions || help) && (
      <div className={styles.actions}>
        {actions}
        {help}
      </div>
    )}
  </header>
)

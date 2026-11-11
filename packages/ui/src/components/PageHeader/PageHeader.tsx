import { IconPlaque } from '../IconPlaque/IconPlaque'
import styles from './PageHeader.module.scss'
import type { PageHeaderProps } from './PageHeader.types'

/**
 * Шапка вида в середине окна (Connectors, сценарии, статистика): полоса над прокруткой со
 * своей подложкой и линией снизу - иконка вида, заголовок, справа действия и «?» с
 * пояснением у самого края. Пояснения абзацем нет: текст в интерфейсе не копится. Вкладки
 * или фильтры вида - нижний ряд под линией (toolbar), а не своя полоса в фиче. Не уезжает
 * с прокруткой. Разделы под ней - Section.
 */
export const PageHeader = ({ icon, iconTone, title, help, actions, toolbar }: PageHeaderProps) => (
  <header className={styles.pageHeader}>
    <div className={styles.strip}>
      {icon && <IconPlaque icon={icon} tone={iconTone} />}
      <h1 className={styles.title}>{title}</h1>
      {(actions || help) && (
        <div className={styles.actions}>
          {actions}
          {help}
        </div>
      )}
    </div>
    {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
  </header>
)

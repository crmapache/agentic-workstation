import { useId } from 'react'
import clsx from 'clsx'

import styles from './Section.module.scss'
import type { SectionProps } from './Section.types'

/**
 * Раздел с шапкой: заголовок, число, строка состояния, справа действия и «?» с пояснением
 * у самого края, под ним - содержимое. lg -
 * разделы вида под PageHeader (заголовок h2 и линия), sm - разделы внутри Modal и
 * карточки (подпись капсом, h3). Рамки нет: содержимое само в плитках и строках, в
 * отличие от Card.
 */
export const Section = ({
  title,
  count,
  description,
  help,
  actions,
  size = 'lg',
  children,
}: SectionProps) => {
  const titleId = useId()
  const Heading = size === 'lg' ? 'h2' : 'h3'

  return (
    <section className={clsx(styles.section, styles[size])} aria-labelledby={titleId}>
      <div className={styles.head}>
        <div className={styles.text}>
          <Heading id={titleId} className={styles.title}>
            {title}
            {count !== undefined && <span className={styles.count}>{count}</span>}
          </Heading>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {(actions || help) && (
          <div className={styles.actions}>
            {actions}
            {help}
          </div>
        )}
      </div>
      {children}
    </section>
  )
}

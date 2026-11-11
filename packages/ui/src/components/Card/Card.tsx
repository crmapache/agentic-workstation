import clsx from 'clsx'

import { CARD_ICON_SIZE, CARD_ICON_STROKE_WIDTH } from './Card.constants'
import styles from './Card.module.scss'
import type { CardProps } from './Card.types'

/**
 * Стеклянная карточка внутри панели: заголовок, строка состояния, справа число, действия и «?»
 * справки у самого края, содержимое. Для группы настроек, сводки, блока в GUI провайдера. Тон accent - то, что
 * ждёт ответа человека: оранжевая рамка и заголовок. fit - не выше места, где стоит: тело
 * сжимается, шапка на виду. Всплывающее поверх окна - Popover или Dialog, не карточка.
 */
export const Card = ({
  title,
  count,
  description,
  icon: Icon,
  help,
  tone = 'neutral',
  size = 'md',
  actions,
  fit = false,
  children,
}: CardProps) => {
  const hasHeader = Boolean(title || actions || help || count !== undefined)

  return (
    <section
      aria-label={title}
      className={clsx(styles.card, styles[tone], styles[size], fit && styles.fit)}>
      {hasHeader && (
        <>
          <div className={styles.header}>
            <div className={styles.heading}>
              {title && (
                <div className={styles.title}>
                  {Icon && (
                    <Icon
                      className={styles.icon}
                      size={CARD_ICON_SIZE}
                      strokeWidth={CARD_ICON_STROKE_WIDTH}
                      aria-hidden
                    />
                  )}
                  {title}
                </div>
              )}
              {description && <div className={styles.description}>{description}</div>}
            </div>
            {(actions || help || count !== undefined) && (
              <div className={styles.actions}>
                {count !== undefined && <span className={styles.count}>{count}</span>}
                {actions}
                {help}
              </div>
            )}
          </div>
          {size === 'md' && <div className={styles.divider} />}
        </>
      )}
      <div className={styles.body}>{children}</div>
    </section>
  )
}

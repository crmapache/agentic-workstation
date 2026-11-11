import clsx from 'clsx'

import { CARD_ICON_SIZE, CARD_ICON_STROKE_WIDTH } from './Card.constants'
import styles from './Card.module.scss'
import type { CardProps } from './Card.types'

/**
 * Стеклянная карточка внутри панели: заголовок, строка состояния, справа действия и «?»
 * справки у самого края, содержимое. Для группы настроек, сводки, блока в GUI провайдера. Тон accent - то, что
 * ждёт ответа человека: оранжевая рамка и заголовок. Всплывающее поверх окна - Popover
 * или Dialog, не карточка.
 */
export const Card = ({
  title,
  description,
  icon: Icon,
  help,
  tone = 'neutral',
  size = 'md',
  actions,
  children,
}: CardProps) => {
  const hasHeader = Boolean(title || actions || help)

  return (
    <section aria-label={title} className={clsx(styles.card, styles[tone], styles[size])}>
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
            {(actions || help) && (
              <div className={styles.actions}>
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

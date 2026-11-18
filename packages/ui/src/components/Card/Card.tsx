import type { MouseEvent } from 'react'
import clsx from 'clsx'
import { ChevronUp, ChevronDown } from 'lucide-react'

import { IconButton } from '../IconButton/IconButton'
import { CARD_ICON_SIZE, CARD_ICON_STROKE_WIDTH } from './Card.constants'
import styles from './Card.module.scss'
import type { CardProps } from './Card.types'
import { isAreaPress } from './Card.utils'

/**
 * Стеклянная карточка внутри панели: заголовок, строка состояния, справа число, действия и «?»
 * справки у самого края, содержимое. Для группы настроек, сводки, блока в GUI провайдера. Тон accent - то, что
 * ждёт ответа человека: оранжевая рамка и заголовок. fit - не выше места, где стоит: тело
 * сжимается, шапка на виду. onPress - карточка нажимается вся (ведёт к своему предмету), её
 * кнопки - сами по себе. collapse - сворачивается до шапки стрелкой и щелчком по шапке. Всплывающее
 * поверх окна - Popover или Dialog, не карточка.
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
  onPress,
  collapse,
  children,
}: CardProps) => {
  const hasHeader = Boolean(title || actions || help || collapse || count !== undefined)
  const isCollapsed = collapse?.expanded === false

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (onPress && isAreaPress(event)) onPress()
  }

  // Шапку, которая свернула или раскрыла карточку, площадь карточки с onPress уже не видит.
  const handleHeaderClick = (event: MouseEvent<HTMLElement>) => {
    if (!collapse || !isAreaPress(event)) return

    event.preventDefault()
    collapse.onToggle()
  }

  return (
    <section
      aria-label={title}
      className={clsx(
        styles.card,
        styles[tone],
        styles[size],
        fit && styles.fit,
        onPress && styles.pressable,
        collapse && styles.collapsible,
        isCollapsed && styles.collapsed,
      )}
      onClick={onPress && handleClick}>
      {hasHeader && (
        <>
          <div className={styles.header} onClick={collapse && handleHeaderClick}>
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
            {(actions || help || collapse || count !== undefined) && (
              <div className={styles.actions}>
                {count !== undefined && <span className={styles.count}>{count}</span>}
                {actions}
                {collapse && (
                  <IconButton
                    icon={collapse.expanded ? ChevronUp : ChevronDown}
                    size="sm"
                    label={collapse.label}
                    onClick={collapse.onToggle}
                  />
                )}
                {help}
              </div>
            )}
          </div>
          {size === 'md' && !isCollapsed && <div className={styles.divider} />}
        </>
      )}
      {!isCollapsed && <div className={styles.body}>{children}</div>}
    </section>
  )
}

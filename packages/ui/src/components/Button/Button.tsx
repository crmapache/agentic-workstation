import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'

import {
  BUTTON_ICON_SIZE,
  BUTTON_CHEVRON_SIZE,
  BUTTON_ICON_STROKE_WIDTH,
  BUTTON_CHEVRON_STROKE_WIDTH,
} from './Button.constants'
import styles from './Button.module.scss'
import type { ButtonProps } from './Button.types'

/**
 * Кнопка с текстом: действие в тосте, пустом состоянии, диалоге. primary - главное
 * действие (тонированное оранжевым), secondary - рядом с главным, ghost - тихое, danger -
 * необратимое (удалить), тонированное красным, dashed - приглашение добавить (рамка пунктиром).
 * menu - открывает меню действий: стрелка справа, открытое меню держит кнопку нажатой. Кнопка
 * только с иконкой - IconButton.
 */
export const Button = ({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  icon: Icon,
  menu = false,
  children,
  ...rest
}: ButtonProps) => (
  <button
    type={type}
    aria-haspopup={menu ? 'menu' : undefined}
    className={clsx(styles.button, styles[variant], styles[size])}
    {...rest}>
    {Icon && (
      <Icon
        className={styles.icon}
        size={BUTTON_ICON_SIZE[size]}
        strokeWidth={BUTTON_ICON_STROKE_WIDTH}
        aria-hidden
      />
    )}
    {children}
    {menu && (
      <ChevronDown
        className={styles.chevron}
        size={BUTTON_CHEVRON_SIZE[size]}
        strokeWidth={BUTTON_CHEVRON_STROKE_WIDTH}
        aria-hidden
      />
    )}
  </button>
)

import type { ReactNode, ButtonHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * primary - главное действие, secondary - рядом с главным, ghost - тихое, danger - необратимое,
 * dashed - приглашение добавить: место, где встанет новое, а не действие над тем, что есть.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dashed'

/** sm и md - строки и полосы окна; touch - под палец (телефон): не ниже --size-touch-target. */
export type ButtonSize = 'sm' | 'md' | 'touch'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Иконка слева от текста. */
  icon?: LucideIcon | undefined
  /**
   * Кнопка открывает меню действий: стрелка вниз справа и aria-haspopup. Меню с текущим
   * значением (проект, ветка) - DropdownButton.
   */
  menu?: boolean | undefined
  children: ReactNode
}

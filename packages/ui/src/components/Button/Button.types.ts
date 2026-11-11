import type { ReactNode, ButtonHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export type ButtonSize = 'sm' | 'md'

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

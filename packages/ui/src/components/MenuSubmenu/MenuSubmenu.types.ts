import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type MenuSubmenuProps = {
  /** Подпись пункта, который открывает меню. */
  label: string
  icon?: LucideIcon | undefined
  disabled?: boolean | undefined
  /** Подпись меню сбоку для чтения с экрана: «Implement with». */
  menuLabel: string
  /** Пункты меню сбоку - MenuItem. */
  children: ReactNode
}

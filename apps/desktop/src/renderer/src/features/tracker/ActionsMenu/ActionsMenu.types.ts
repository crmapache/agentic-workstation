import type { LucideIcon } from 'lucide-react'

/** Пункт меню действий; danger - удаление и прочее необратимое. */
export type ActionItem = {
  key: string
  icon: LucideIcon
  label: string
  danger?: boolean | undefined
  disabled?: boolean | undefined
  onSelect: () => void
}

export type ActionsMenuProps = {
  /** Подпись кнопки «⋯» и меню для чтения с экрана. */
  label: string
  items: readonly ActionItem[]
}

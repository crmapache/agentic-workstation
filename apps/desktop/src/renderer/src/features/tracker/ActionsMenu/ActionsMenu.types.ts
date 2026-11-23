import type { LucideIcon } from 'lucide-react'

/**
 * Пункт меню действий; danger - удаление и прочее необратимое, description - вторая строка
 * (почему пункт погашен).
 */
export type ActionLeaf = {
  key: string
  icon: LucideIcon
  label: string
  description?: string | undefined
  danger?: boolean | undefined
  disabled?: boolean | undefined
  onSelect: () => void
}

/** Пункт с меню сбоку: действие со вторым шагом («Implement» - кем). */
export type ActionBranch = {
  key: string
  icon: LucideIcon
  label: string
  disabled?: boolean | undefined
  /** Подпись меню сбоку для чтения с экрана. */
  menuLabel: string
  items: readonly ActionLeaf[]
}

export type ActionItem = ActionLeaf | ActionBranch

export type ActionsMenuProps = {
  /** Подпись кнопки «⋯» и меню для чтения с экрана. */
  label: string
  items: readonly ActionItem[]
}

export type ActionLeafItemProps = { item: ActionLeaf; onClose: () => void }

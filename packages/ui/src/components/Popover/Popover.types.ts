import type { Ref, ReactNode, ToggleEventHandler } from 'react'

/** md, lg, xl - своей ширины; field - шириной с поле, которое её открыло (SelectField). */
export type PopoverWidth = 'md' | 'lg' | 'xl' | 'field'

/**
 * Где встаёт панель: под кнопкой, которая её открыла (меню проекта, ветки), или сверху
 * по центру окна - у панели, которую открывают и сочетанием клавиш (поиск везде).
 */
export type PopoverPlacement = 'anchor' | 'top'

export type PopoverProps = {
  id: string
  ref: Ref<HTMLDivElement>
  onToggle: ToggleEventHandler<HTMLDivElement>
  width?: PopoverWidth
  placement?: PopoverPlacement
  children: ReactNode
}

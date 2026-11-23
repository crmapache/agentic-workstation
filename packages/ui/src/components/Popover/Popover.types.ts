import type { Ref, ReactNode, ToggleEventHandler } from 'react'

/**
 * md, lg, xl - своей ширины; field - шириной с поле, которое её открыло (SelectField); content -
 * по содержимому, не шире md (короткое меню сбоку, MenuSubmenu).
 */
export type PopoverWidth = 'md' | 'lg' | 'xl' | 'field' | 'content'

/**
 * Где встаёт панель: под кнопкой, которая её открыла (меню проекта, ветки), сверху
 * по центру окна - у панели, которую открывают и сочетанием клавиш (поиск везде), или сбоку от
 * пункта меню, который её открыл (MenuSubmenu).
 */
export type PopoverPlacement = 'anchor' | 'top' | 'side'

export type PopoverProps = {
  id: string
  ref: Ref<HTMLDivElement>
  onToggle: ToggleEventHandler<HTMLDivElement>
  width?: PopoverWidth
  placement?: PopoverPlacement
  children: ReactNode
}

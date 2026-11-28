import { Eraser, Pencil, Underline, MoveUpRight } from 'lucide-react'

/** Инструменты панели по порядку: значок и ключ подписи (ADR 0135). */
export const PEN_TOOLS = [
  { pen: 'outline', icon: Pencil, labelKey: 'walkthrough.panel.outline' },
  { pen: 'underline', icon: Underline, labelKey: 'walkthrough.panel.underline' },
  { pen: 'arrow', icon: MoveUpRight, labelKey: 'walkthrough.panel.arrow' },
] as const

/** Кнопка «стереть мои пометки» под инструментами. */
export const ERASE_ICON = Eraser

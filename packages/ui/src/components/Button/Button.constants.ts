import type { ButtonSize } from './Button.types'

// Размер глифа в пикселях: lucide принимает число, а не CSS-переменную.
// Совпадает с --size-icon-xs / --size-icon-sm из tokens.css.
export const BUTTON_ICON_SIZE: Record<ButtonSize, number> = {
  sm: 12,
  md: 14,
}

export const BUTTON_ICON_STROKE_WIDTH = 1.75

// Стрелка меню мельче иконки слева, как у DropdownButton: она подсказка, а не содержание.
export const BUTTON_CHEVRON_SIZE: Record<ButtonSize, number> = {
  sm: 10,
  md: 12,
}

export const BUTTON_CHEVRON_STROKE_WIDTH = 2

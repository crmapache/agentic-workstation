import type { SpinnerSize } from '../Spinner/Spinner.types'
import type { IconButtonSize } from './IconButton.types'

// Размер глифа в пикселях: lucide принимает число, а не CSS-переменную.
// Совпадает с --size-icon-sm / --size-icon-md из tokens.css; xs - глиф внутри плашки.
export const ICON_SIZE: Record<IconButtonSize, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  touch: 18,
}

export const ICON_STROKE_WIDTH = 1.75

// Крутилка занятой кнопки - на месте глифа и не больше него.
export const BUSY_SPINNER_SIZE: Record<IconButtonSize, SpinnerSize> = {
  xs: 'sm',
  sm: 'sm',
  md: 'md',
  touch: 'md',
}

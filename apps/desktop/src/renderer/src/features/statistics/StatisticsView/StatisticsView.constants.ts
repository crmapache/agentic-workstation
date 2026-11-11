import { Minus, ArrowUp, ArrowDown } from 'lucide-react'

/** Стрелка изменения - ростом с цифры рядом (кегль xs). */
export const DELTA_ICON_SIZE = 12

export const DELTA_ICON_STROKE = 2

/** Знак изменения по направлению: «на месте» - чертой, а не стрелкой. */
export const DELTA_ICONS = { up: ArrowUp, down: ArrowDown, flat: Minus } as const

/** Сколько дней присутствия нужно, чтобы календарь сам показывал присутствие, а не токены. */
export const PRESENCE_DAYS_FOR_CALENDAR = 14

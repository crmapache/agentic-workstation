import type { MouseEvent } from 'react'

/** Нажатие не забирает фокус у поля: клавиатура остаётся, печатать можно дальше. */
export const keepFieldFocus = (event: MouseEvent) => event.preventDefault()

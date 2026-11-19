import type { MouseEvent } from 'react'

/**
 * Кнопки поля (крестик, переключатели) не забирают фокус: нажатие, а потом возврат фокуса
 * в поле - видимое мигание его рамки.
 */
export const keepFocus = (event: MouseEvent) => event.preventDefault()

import { useRef, useState, useEffect } from 'react'
import type { KeyboardEvent } from 'react'

import type { DatePickerProps } from './DatePicker.types'
import { clampDay, addMonths, movedDayOf, monthStartOf } from './DatePicker.utils'

type DayCursorOptions = Pick<DatePickerProps, 'value' | 'min' | 'max' | 'autoFocus'>

/**
 * Курсор клавиатуры по дням: на каком дне фокус, а на виду - его месяц. Стрелки, Home и End,
 * PageUp и PageDown двигают курсор в пределах min и max и переводят на него фокус; стрелки
 * месяцев в шапке листают тем же курсором, но фокус оставляют на себе. При появлении -
 * фокус на выбранный день, если просили.
 */
export const useDayCursor = ({ value, min, max, autoFocus }: DayCursorOptions) => {
  const gridRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState(() => clampDay(value, min, max))
  const focusPending = useRef(autoFocus === true)

  useEffect(() => {
    if (!focusPending.current) return

    focusPending.current = false
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${cursor}"]`)?.focus()
  }, [cursor])

  const moveCursor = (day: number, focus: boolean) => {
    focusPending.current = focus
    setCursor(clampDay(day, min, max))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moved = movedDayOf(cursor, event.key)

    if (moved === null) return

    event.preventDefault()
    moveCursor(moved, true)
  }

  const showMonth = (months: number) => moveCursor(addMonths(cursor, months), false)

  return { gridRef, cursor, month: monthStartOf(cursor), handleKeyDown, showMonth }
}

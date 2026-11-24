import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

import { useCalendarStore } from '../calendar.store'
import { onTextSizeApplied } from '../../../state/text-size.store'
import { sidebarPixels, roomBesideGrid } from './CalendarView.utils'

/**
 * Помещается ли панель рядом с сеткой: вид меряется на каждое изменение своей ширины, ширины
 * панели и размера текста (токены растут от него). Не помещается - стор узнаёт, что вид узкий:
 * панель уходит сама, а сетка не сжимается уже своей наименьшей ширины.
 */
export const useNarrowCalendar = (
  view: RefObject<HTMLDivElement | null>,
  sidebarWidth: number | null,
) => {
  const setNarrow = useCalendarStore((store) => store.setNarrow)

  useLayoutEffect(() => {
    const node = view.current

    if (!node) return

    const measure = () => {
      // Вид спрятан (стоит в стопке видов или середина свёрнута): мерить нечего.
      if (node.clientWidth === 0) return

      setNarrow(roomBesideGrid(node) < sidebarPixels(node, sidebarWidth))
    }
    const observer = new ResizeObserver(measure)
    const stopText = onTextSizeApplied(measure)

    measure()
    observer.observe(node)

    return () => {
      observer.disconnect()
      stopText()
    }
  }, [view, sidebarWidth, setNarrow])
}

import { useState, useLayoutEffect } from 'react'
import type { RefObject } from 'react'

import { weeksThatFit } from './CalendarHeatmap.utils'

/**
 * Сколько последних недель влезает в ширину календаря клетками не меньше своего размера: недели
 * делят всю ширину, а не влезли - уходят самые старые, слева, без прокрутки. Размер клетки -
 * строка подписи календаря (line-height корня и есть клетка), зазор - колонок сетки.
 */
export const useFittedWeeks = (
  boxRef: RefObject<HTMLElement | null>,
  gridRef: RefObject<HTMLElement | null>,
  total: number,
): number => {
  const [weeks, setWeeks] = useState(total)

  useLayoutEffect(() => {
    const box = boxRef.current
    const grid = gridRef.current

    if (!box || !grid) return

    const fit = () => {
      const style = getComputedStyle(grid)

      setWeeks(
        weeksThatFit(
          box.getBoundingClientRect().width,
          parseFloat(style.lineHeight),
          parseFloat(style.columnGap),
          total,
        ),
      )
    }

    fit()

    const observer = new ResizeObserver(fit)

    observer.observe(box)

    return () => observer.disconnect()
  }, [boxRef, gridRef, total])

  return weeks
}

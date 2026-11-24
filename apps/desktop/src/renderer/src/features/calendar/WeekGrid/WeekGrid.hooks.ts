import type { RefObject } from 'react'
import { useRef, useLayoutEffect } from 'react'

import { DAY_MINUTES, SCROLL_BEFORE_WORK_MINUTES } from '../calendar.constants'

/**
 * Сетка открывается с начала рабочего дня (с запасом - видно и утро перед ним), а не с
 * полуночи: прокрутка ставится один раз при появлении, дальше её держит человек - смена
 * рабочего времени её не дёргает.
 */
export const useScrollToMorning = (ref: RefObject<HTMLDivElement | null>, workFrom: number) => {
  const firstFrom = useRef(workFrom)

  useLayoutEffect(() => {
    const scroller = ref.current
    const minute = Math.max(0, firstFrom.current - SCROLL_BEFORE_WORK_MINUTES)

    if (scroller) scroller.scrollTop = (scroller.scrollHeight / DAY_MINUTES) * minute
  }, [ref])
}

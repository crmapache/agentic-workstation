import type { RefObject } from 'react'
import { useLayoutEffect } from 'react'

import { SCROLL_TO_HOUR } from '../calendar.constants'
import { HOURS } from './WeekGrid.constants'

/**
 * Сетка открывается с утра, а не с полуночи: прокрутка ставится один раз при появлении, дальше
 * её держит человек.
 */
export const useScrollToMorning = (ref: RefObject<HTMLDivElement | null>) => {
  useLayoutEffect(() => {
    const scroller = ref.current

    if (scroller) scroller.scrollTop = (scroller.scrollHeight / HOURS.length) * SCROLL_TO_HOUR
  }, [ref])
}

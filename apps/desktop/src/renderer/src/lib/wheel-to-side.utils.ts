import { WHEEL_LINE_PX } from './wheel-to-side.constants'

/**
 * Ход колеса в пикселях. Колесо не всегда меряет пикселями: у части мышей событие
 * приходит строками или страницами, и «сырое» число 3 вместо 100 ряд почти не двигало.
 */
export const wheelStep = (event: WheelEvent, element: HTMLElement): number => {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * WHEEL_LINE_PX
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * element.clientWidth

  return event.deltaY
}

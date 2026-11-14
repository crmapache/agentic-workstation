import { useCallback } from 'react'

import { wheelStep } from './wheel-to-side.utils'

/**
 * Колесо мыши листает ряд вбок (чипы потоков, вкладки проектов): оно крутит только
 * вертикально, и без перевода то, что за краем ряда, было бы недоступно без трекпада и
 * Shift. Горизонтальный жест трекпада браузер ведёт сам. Слушатель не пассивный - иначе
 * под рядом листалось бы и то, что под ним. Отдаёт ref-колбэк для элемента ряда.
 */
export const useWheelToSide = () =>
  useCallback((element: HTMLDivElement | null) => {
    if (!element) return

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return

      element.scrollLeft += wheelStep(event, element)
      event.preventDefault()
    }

    element.addEventListener('wheel', handleWheel, { passive: false })

    return () => element.removeEventListener('wheel', handleWheel)
  }, [])

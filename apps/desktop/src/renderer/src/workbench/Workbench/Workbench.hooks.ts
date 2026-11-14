import { useRef, useLayoutEffect } from 'react'
import type { RefObject } from 'react'

import { SHEET_GAP } from '../../state/layout.constants'
import { useLayoutStore } from '../../state/layout.store'

/** Ширина листа на экране. Свёрнутая панель скрыта целиком - у неё ноль. */
const sheetWidth = (sheet: RefObject<HTMLElement | null>) =>
  sheet.current?.getBoundingClientRect().width ?? 0

/**
 * Мерит место, которое делят середина и правая колонка, и левая панель вместе с зазором
 * за ней (room раскладки): это сумма трёх листов и зазор левой, если она стоит в ряду.
 * С зазором место одно и то же, видна левая или нет: она прячется сама, когда ей не хватает
 * места (isSideShown), и место без зазора прыгало бы на него с каждым её появлением. Листы
 * панелей ужимаются стилями, а не уезжают за край окна, поэтому сумма всегда равна ряду
 * без полос иконок и их зазоров. Наблюдается сам ряд, а не листы: ряд меняется только с
 * окном, а листы - и от каждой перестановки ширин, которую замер сам же и вызывает.
 * Открылась или закрылась правая колонка - перемер: зазоров в ряду стало другое число.
 */
export const useRoomMeasure = () => {
  const rowRef = useRef<HTMLDivElement>(null)
  const sideRef = useRef<HTMLElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const providerRef = useRef<HTMLElement>(null)
  // Правая колонка стоит, пока открыта панель провайдера или терминал под ней.
  const isProviderOpen = useLayoutStore((state) => state.provider.isOpen || state.terminal.isOpen)
  const setRoom = useLayoutStore((state) => state.setRoom)

  // До отрисовки: в узком окне середина не мелькнёт при старте, а сразу встанет свёрнутой.
  useLayoutEffect(() => {
    const row = rowRef.current

    if (!row) return

    const measure = () => {
      const side = sheetWidth(sideRef)

      setRoom(
        Math.floor(
          side + (side > 0 ? SHEET_GAP : 0) + sheetWidth(mainRef) + sheetWidth(providerRef),
        ),
      )
    }
    const observer = new ResizeObserver(measure)

    measure()
    observer.observe(row)

    return () => observer.disconnect()
  }, [setRoom, isProviderOpen])

  return { rowRef, sideRef, mainRef, providerRef }
}

import { useRef, useLayoutEffect } from 'react'
import type { RefObject } from 'react'

import { useLayoutStore } from '../../state/layout.store'

/** Ширина листа на экране. Свёрнутая панель скрыта целиком - у неё ноль. */
const sheetWidth = (sheet: RefObject<HTMLElement | null>) =>
  sheet.current?.getBoundingClientRect().width ?? 0

/**
 * Мерит место, которое делят левая панель, середина и правая панель (room раскладки):
 * это сумма трёх листов. Листы панелей ужимаются стилями, а не уезжают за край окна,
 * поэтому сумма всегда равна ряду без полос иконок и зазоров. Наблюдается сам ряд, а не
 * листы: ряд меняется только с окном, а листы - и от каждой перестановки ширин, которую
 * замер сам же и вызывает. Открылась или закрылась панель - перемер: зазоров между
 * листами стало другое число.
 */
export const useRoomMeasure = () => {
  const rowRef = useRef<HTMLDivElement>(null)
  const sideRef = useRef<HTMLElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const providerRef = useRef<HTMLElement>(null)
  const isSideOpen = useLayoutStore((state) => state.side.isOpen)
  // Правая колонка стоит, пока открыта панель провайдера или терминал под ней.
  const isProviderOpen = useLayoutStore((state) => state.provider.isOpen || state.terminal.isOpen)
  const setRoom = useLayoutStore((state) => state.setRoom)

  // До отрисовки: в узком окне середина не мелькнёт при старте, а сразу встанет свёрнутой.
  useLayoutEffect(() => {
    const row = rowRef.current

    if (!row) return

    const measure = () =>
      setRoom(Math.floor(sheetWidth(sideRef) + sheetWidth(mainRef) + sheetWidth(providerRef)))
    const observer = new ResizeObserver(measure)

    measure()
    observer.observe(row)

    return () => observer.disconnect()
  }, [setRoom, isSideOpen, isProviderOpen])

  return { rowRef, sideRef, mainRef, providerRef }
}

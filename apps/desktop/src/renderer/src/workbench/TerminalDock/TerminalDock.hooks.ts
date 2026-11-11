import { useRef, useState, useLayoutEffect } from 'react'

/**
 * Место под оба листа колонки - высота колонки без зазора между листами. Мерится до
 * отрисовки: иначе первый кадр терминала вышел бы нулевой высоты.
 */
export const useColumnRoom = () => {
  const dockRef = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState(0)

  useLayoutEffect(() => {
    const column = dockRef.current?.parentElement

    if (!column) return

    const measure = () =>
      setRoom(column.clientHeight - Number.parseFloat(getComputedStyle(column).rowGap || '0'))
    const observer = new ResizeObserver(measure)

    measure()
    observer.observe(column)

    return () => observer.disconnect()
  }, [])

  return { dockRef, room }
}

import { useRef, useState, useLayoutEffect } from 'react'

/**
 * Ширина места под дорогу - до отрисовки (ResizeObserver): ряд складывается по ней, и
 * вылезший за карточку ряд не мелькает ни кадра.
 */
export const useRoadWidth = () => {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const node = ref.current

    if (!node) return

    setWidth(node.getBoundingClientRect().width)

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })

    observer.observe(node)

    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

import { useRef, useState, useLayoutEffect } from 'react'

import type { RoadMetrics } from '../scenarios-road.utils'

/**
 * Ширина места под дорогу и размеры её частей - до отрисовки (ResizeObserver): ряд складывается
 * по ним, и вылезший за карточку ряд не мелькает ни кадра. Части меряются по образцу, нарисованному
 * теми же классами: кружок растёт с размером текста IDE (ADR 0024), а число в коде от него
 * отставало - на крупном тексте дорога вылезала за карточку и резала остановки.
 */
export const useRoadMeasure = () => {
  const ref = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [metrics, setMetrics] = useState<RoadMetrics | null>(null)

  useLayoutEffect(() => {
    const node = ref.current
    const probe = probeRef.current

    if (!node || !probe) return

    const [stop, link, fold] = probe.children
    const widthOf = (part: Element | undefined) => part?.getBoundingClientRect().width ?? 0

    const measure = () => {
      const next = { stop: widthOf(stop), link: widthOf(link), fold: widthOf(fold) }

      setWidth(widthOf(node))
      setMetrics((now) =>
        now?.stop === next.stop && now.link === next.link && now.fold === next.fold ? now : next,
      )
    }

    measure()

    // Образец меняет размер вместе с размером текста - тогда ряд складывается заново.
    const observer = new ResizeObserver(measure)

    observer.observe(node)
    for (const part of probe.children) observer.observe(part)

    return () => observer.disconnect()
  }, [])

  return { ref, probeRef, width, metrics }
}

import { useRef, useState, useEffect } from 'react'

import { CUT_SLACK_PX } from './ScenarioRunTimeline.constants'

/**
 * Обрезан ли текст в окне строки - по настоящей высоте, а не по числу символов: затухание
 * ставится, только когда правда обрезано. Текст меняется без отрисовки (доехал шрифт, разбор
 * Markdown подгрузился, окно стало уже) - обмер приходит наблюдателем.
 */
export const useGlanceCut = (isClamped: boolean) => {
  const boxRef = useRef<HTMLDivElement>(null)
  const [isCut, setIsCut] = useState(false)

  useEffect(() => {
    const box = boxRef.current
    const text = box?.firstElementChild

    if (!isClamped || !box || !text) return

    const observer = new ResizeObserver(() =>
      setIsCut(text.getBoundingClientRect().height > box.clientHeight + CUT_SLACK_PX),
    )

    observer.observe(box)
    observer.observe(text)

    return () => observer.disconnect()
  }, [isClamped])

  return { boxRef, isCut: isClamped && isCut }
}

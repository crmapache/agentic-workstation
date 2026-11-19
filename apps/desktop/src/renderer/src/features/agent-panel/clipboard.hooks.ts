import { useRef, useState, useEffect, useCallback } from 'react'

import { COPIED_FEEDBACK_MS } from './clipboard.constants'

/**
 * Копирование в буфер с отметкой «скопировано» на пару секунд: кнопка меняет иконку,
 * чтобы было видно, что нажатие сработало.
 */
export const useCopy = () => {
  const [isCopied, setIsCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const copy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setIsCopied(true)

      if (timer.current !== null) window.clearTimeout(timer.current)

      timer.current = window.setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS)
    })
  }, [])

  return { isCopied, copy }
}

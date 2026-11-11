import { useRef, useState, useEffect } from 'react'

import { COPIED_FEEDBACK_MS } from './CodeSnippet.constants'

/** Копия в буфер с галочкой на пару мгновений: видно, что нажатие сработало. */
export const useCopied = () => {
  const [isCopied, setIsCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setIsCopied(true)

      if (timer.current !== null) window.clearTimeout(timer.current)

      timer.current = window.setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS)
    })
  }

  return { isCopied, copy }
}

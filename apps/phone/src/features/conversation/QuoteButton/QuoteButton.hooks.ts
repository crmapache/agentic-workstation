import { useRef, useState, useEffect, useCallback } from 'react'
import type { RefObject } from 'react'

import { PRESS_HOLD_MS } from './QuoteButton.constants'
import type { QuotableSelection } from './QuoteButton.types'
import { quotableSelection } from './QuoteButton.utils'

/**
 * Выделенное в ленте, которое можно процитировать. Следит за selectionchange (долгое нажатие и
 * ручки выделения мышиных событий не шлют), за прокруткой ленты и размером экрана - раз за кадр.
 * Касание кнопки снимает выделение раньше click: hold держит то, что было на касании.
 */
export const useQuotableSelection = (bodyRef: RefObject<HTMLDivElement | null>) => {
  const [shown, setShown] = useState<QuotableSelection | null>(null)
  const held = useRef<QuotableSelection | null>(null)
  const releaseTimer = useRef(0)

  useEffect(() => {
    const body = bodyRef.current
    let frame = 0

    const check = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!held.current) setShown(quotableSelection(bodyRef.current))
      })
    }

    document.addEventListener('selectionchange', check)
    body?.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)

    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(releaseTimer.current)
      document.removeEventListener('selectionchange', check)
      body?.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [bodyRef])

  const hold = useCallback(() => {
    held.current = shown
    clearTimeout(releaseTimer.current)
    releaseTimer.current = window.setTimeout(() => {
      held.current = null
      setShown(quotableSelection(bodyRef.current))
    }, PRESS_HOLD_MS)
  }, [shown, bodyRef])

  /** Цитата взята: выделение снимается, кнопка уходит. */
  const take = useCallback((): string | null => {
    const text = (held.current ?? shown)?.text ?? null

    held.current = null
    clearTimeout(releaseTimer.current)
    window.getSelection()?.removeAllRanges()
    setShown(null)

    return text
  }, [shown])

  return { shown, hold, take }
}

import { useRef, useState, useLayoutEffect } from 'react'
import type { RefObject, FocusEvent, PointerEvent, KeyboardEvent } from 'react'

import type { MarkSteps } from './ChartTip.types'
import { markOf, nextMark } from './ChartTip.utils'

/**
 * Подсказка у метки графика: одна на график, встаёт к метке с data-mark={mark} внутри
 * frameRef, переходит от метки к метке без задержки (в отличие от Tooltip у кнопки: по
 * столбцам ведут рукой и ждать на каждом некогда). mark null - спрятана. Показ - после
 * каждой отрисовки: содержимое подсказки уже про новую метку, а пришли новые данные под тем
 * же номером - метка уже другой элемент, и подсказка переходит к нему, а не висит у старого.
 */
export const useChartTip = (frameRef: RefObject<HTMLElement | null>, mark: number | null) => {
  const tipRef = useRef<HTMLSpanElement>(null)
  const shownAt = useRef<Element | null>(null)

  useLayoutEffect(() => {
    const tip = tipRef.current
    const anchor =
      mark === null ? null : (frameRef.current?.querySelector(`[data-mark="${mark}"]`) ?? null)

    if (!tip) return

    const open = tip.matches(':popover-open')

    if (open && anchor === shownAt.current) return
    if (open) tip.hidePopover()

    shownAt.current = anchor

    if (anchor instanceof HTMLElement) tip.showPopover({ source: anchor })
  })

  return tipRef
}

/**
 * Метка под рукой: указатель, стрелки, Home и End. Фокус с клавиатуры ставит на самую
 * свежую метку, фокус мышью - нет (её и так ведёт указатель). Метки размечаются
 * data-mark с номером: обработчик один на весь график, а не на каждый столбец.
 */
export const useMarkCursor = (count: number, steps: MarkSteps) => {
  const [mark, setMark] = useState<number | null>(null)

  const handlePointerOver = (event: PointerEvent<HTMLElement>) => {
    const next = markOf(event.target)

    if (next !== null) setMark(next)
  }

  const handlePointerLeave = () => setMark(null)

  const handleFocus = (event: FocusEvent<HTMLElement>) => {
    if (event.target.matches(':focus-visible')) setMark((current) => current ?? count - 1)
  }

  const handleBlur = () => setMark(null)

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const next = nextMark(event.key, mark, count, steps)

    if (next === null) return

    event.preventDefault()
    setMark(next)
  }

  return {
    // Данные сменились, а номер остался - метки с ним может уже не быть.
    mark: mark !== null && mark < count ? mark : null,
    handlers: {
      onPointerOver: handlePointerOver,
      onPointerLeave: handlePointerLeave,
      onFocus: handleFocus,
      onBlur: handleBlur,
      onKeyDown: handleKeyDown,
    },
  }
}

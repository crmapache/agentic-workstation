import { useRef } from 'react'
import type { PointerEvent, KeyboardEvent } from 'react'

import { AXIS_KEYS, KEYBOARD_STEP } from './ResizeHandle.constants'

/**
 * Перетаскивание ручки: указатель захватывается, и каждый сдвиг вдоль оси отдаётся наружу
 * разницей с прошлым положением. Клавиатура двигает тем же колбэком шагом KEYBOARD_STEP.
 */
export const useResizeDrag = (axis: 'x' | 'y', onResize: (delta: number) => void) => {
  const last = useRef<number | null>(null)
  const position = (event: PointerEvent) => (axis === 'x' ? event.clientX : event.clientY)

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    last.current = position(event)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (last.current === null) return

    const delta = position(event) - last.current

    last.current = position(event)
    if (delta !== 0) onResize(delta)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId)
    last.current = null
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === AXIS_KEYS[axis].back) onResize(-KEYBOARD_STEP)
    if (event.key === AXIS_KEYS[axis].forward) onResize(KEYBOARD_STEP)
  }

  return { handlePointerDown, handlePointerMove, handlePointerUp, handleKeyDown }
}

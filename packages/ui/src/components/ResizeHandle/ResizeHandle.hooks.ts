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
    // Тянут левой кнопкой: правая открывает меню, и её отпускание жест бы не закончило.
    if (event.button !== 0) return

    event.currentTarget.setPointerCapture(event.pointerId)
    last.current = position(event)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    last.current = null
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (last.current === null) return

    // Отпускание за краем окна или над областью перетаскивания окна macOS странице не
    // отдаёт, и pointerup не приходит. Кнопка уже не нажата - жест кончен, а не панель
    // продолжает ехать за мышью.
    if ((event.buttons & 1) === 0) {
      handlePointerUp(event)

      return
    }

    const delta = position(event) - last.current

    last.current = position(event)
    if (delta !== 0) onResize(delta)
  }

  // Захват отняли (окно потеряло фокус, ручка ушла из разметки) - жест кончен тоже.
  const handleLostPointerCapture = () => {
    last.current = null
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === AXIS_KEYS[axis].back) onResize(-KEYBOARD_STEP)
    if (event.key === AXIS_KEYS[axis].forward) onResize(KEYBOARD_STEP)
  }

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleLostPointerCapture,
    handleKeyDown,
  }
}

import type { ResizeHandleEdge } from './ResizeHandle.types'

// На сколько пикселей сдвигает панель одно нажатие стрелки с клавиатуры.
export const KEYBOARD_STEP = 16

/** Ось, вдоль которой ходит ручка у этого края. */
export const EDGE_AXIS: Record<ResizeHandleEdge, 'x' | 'y'> = {
  start: 'x',
  end: 'x',
  top: 'y',
  bottom: 'y',
}

/** Клавиши «меньше» и «больше» по оси: у боковой ручки - влево и вправо, у верхней - вверх и вниз. */
export const AXIS_KEYS = {
  x: { back: 'ArrowLeft', forward: 'ArrowRight' },
  y: { back: 'ArrowUp', forward: 'ArrowDown' },
} as const

import type { CSSProperties } from 'react'

/** Число остановок - в переменную стиля: по нему дорога своей ширины считается в CSS. */
export const roadStopsStyle = (count: number): CSSProperties =>
  ({ '--road-stops': count }) as CSSProperties

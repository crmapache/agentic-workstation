import type { SpinnerSize } from './Spinner.types'

/** Знак рисуется в своём поле 16×16: радиус и толщина - в его единицах, не в пикселях. */
export const SPINNER_BOX = 16

export const SPINNER_CENTER = SPINNER_BOX / 2

/**
 * Кольцо по размеру: на месте иконки - около трёх четвертей поля, с запасом от края; вокруг
 * знака - у самого края поля и тоньше, иначе кольцо легло бы на номер внутри.
 */
export const SPINNER_RING: Record<SpinnerSize, { radius: number; stroke: number }> = {
  sm: { radius: 6, stroke: 2 },
  md: { radius: 6, stroke: 2 },
  around: { radius: 7.25, stroke: 1.5 },
}

/** Длина дуги в единицах рисунка: шаги анимации длины - доли круга, а не пиксели. */
export const SPINNER_PATH_LENGTH = 100

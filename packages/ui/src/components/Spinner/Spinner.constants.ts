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

/**
 * Шагов в кольце steps: на 14 px шесть штрихов ещё читаются раздельно, при восьми просветы
 * слипаются. То же число - $step-count в Spinner.module.scss (задержки огонька по шагам).
 */
export const SPINNER_STEP_COUNT = 6

/**
 * Штрих шага в долях круга (pathLength 100): шаг - шестая часть круга, минус просвет и круглые
 * концы штриха, которые добавляют по половине толщины с каждой стороны. Просвет выходит около
 * 2 единиц рисунка - на 14 px его видно.
 */
export const SPINNER_STEP_DASH = 6

/**
 * Шаги по кругу, по часовой стрелке от верхней точки: поворот начала штриха. Штрих растёт от
 * начала по ходу круга, поэтому начало сдвинуто назад на полштриха - шаг стоит ровно на своём
 * часе (12, 2, 4…), и кольцо симметрично.
 */
export const SPINNER_STEP_ANGLES = Array.from(
  { length: SPINNER_STEP_COUNT },
  (_, index) =>
    (360 / SPINNER_STEP_COUNT) * index - 90 - (SPINNER_STEP_DASH / SPINNER_PATH_LENGTH) * 180,
)

/** Сторона значка курсора в пикселях страницы. */
export const CURSOR_SIZE = 24

/**
 * Стрелка курсора: современный наконечник со скруглёнными углами и выемкой, симметричный по
 * диагонали (тот же силуэт - на значке расширения, build/icons.ts). Острие - около (2, 2):
 * слой сдвигает стрелку на столько же, чтобы нажатие приходилось ровно в острие.
 */
export const CURSOR_PATH =
  'M2.4 3.1Q2 2 3.1 2.4L20.1 9.3Q21.4 9.9 20.1 10.5L13.6 12.4Q12.7 12.7 12.4 13.6L10.5 20.1Q9.9 21.4 9.3 20.1Z'

/** Короткий путь - быстро, длинный - не дольше полсекунды: агент не должен ждать курсор. */
const MIN_MS = 160
const MAX_MS = 480
const PX_PER_MS = 2.2

export const moveDuration = (
  from: { x: number; y: number },
  to: { x: number; y: number },
): number => {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)

  return Math.round(Math.min(MAX_MS, Math.max(MIN_MS, distance / PX_PER_MS)))
}

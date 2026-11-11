/** Сторона значка курсора в пикселях страницы. */
export const CURSOR_SIZE = 24

/**
 * Стрелка курсора - та же, что на значке расширения (build/icons.ts), в координатах значка
 * курсора; острие - в точке (0, 0), где и происходит нажатие.
 */
export const CURSOR_POINTS = [
  [1, 1],
  [1, 17],
  [5, 13],
  [8, 20],
  [11, 19],
  [8, 12],
  [14, 12],
]
  .map(([x, y]) => `${x},${y}`)
  .join(' ')

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

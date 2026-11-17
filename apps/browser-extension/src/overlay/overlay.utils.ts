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

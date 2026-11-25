export type WindowRect = { x: number; y: number; width: number; height: number }

/** Монитор, как его видит расстановка окна: рабочая область без меню и Dock. */
export type PlacementDisplay = { id: number; internal: boolean; workArea: WindowRect }

/**
 * Где встать окну копии, которую поднимает агент (WINDOW_ASIDE_ENV): на мониторе, куда человек
 * сейчас не смотрит, - не на том, где курсор. Из остальных первым - встроенный экран ноутбука:
 * его владелец держит сбоку (просьба владельца 2026-11-25). Окно не больше рабочей области и
 * по её центру. Другого монитора нет - null: окно встаёт как обычно, только без фокуса.
 */
export const asidePlacement = (
  displays: readonly PlacementDisplay[],
  cursorDisplayId: number,
  size: { width: number; height: number },
): WindowRect | null => {
  const others = displays.filter((display) => display.id !== cursorDisplayId)
  const target = others.find((display) => display.internal) ?? others[0]

  if (!target) return null

  const { workArea } = target
  const width = Math.min(size.width, workArea.width)
  const height = Math.min(size.height, workArea.height)

  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
  }
}

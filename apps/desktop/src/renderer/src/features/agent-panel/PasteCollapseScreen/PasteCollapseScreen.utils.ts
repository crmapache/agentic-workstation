import { PASTE_COLLAPSE_MAX, PASTE_COLLAPSE_MIN } from './PasteCollapseScreen.constants'

/**
 * Набранное в поле - в порог: целое в пределах. Недописанное и нечитаемое - fallback:
 * человек, стерший число, чтобы набрать новое, ещё ничего не попросил.
 */
export const clampPasteCollapse = (typed: string, fallback: number): number => {
  const lines = Number.parseInt(typed, 10)

  if (!Number.isFinite(lines)) return fallback

  return Math.min(PASTE_COLLAPSE_MAX, Math.max(PASTE_COLLAPSE_MIN, lines))
}

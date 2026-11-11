import { CURSOR_PATH_MAX } from '@agentic-workstation/browser-protocol/protocol'
import type { CursorPath } from '@agentic-workstation/browser-protocol/protocol'

/** Самый долгий путь курсора: дольше рука не идёт, а страница не должна ждать украшение. */
const DURATION_MAX_MS = 3000

const isStep = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every((part) => Number.isFinite(part))

/**
 * Путь курсора из сообщения IDE: точки [x, y, мс] по порядку времени, не больше предела.
 * Что-то не так - пути нет, и курсор едет по прямой: украшение не роняет действие.
 */
export const cursorPathOf = (value: unknown): CursorPath | undefined => {
  if (!Array.isArray(value) || value.length < 2 || value.length > CURSOR_PATH_MAX) return undefined
  if (!value.every(isStep)) return undefined

  const steps: CursorPath = value

  return steps.every((step, index) => index === 0 || step[2] >= (steps[index - 1]?.[2] ?? 0))
    ? steps
    : undefined
}

/** Время пути: число в разумных пределах, иначе нет. */
export const cursorDurationOf = (value: unknown): number | undefined =>
  typeof value === 'number' && value > 0 && value <= DURATION_MAX_MS ? value : undefined

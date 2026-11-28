import type { MarkPoint, WalkthroughPen } from '@shared/walkthrough'
import { isWalkthroughPen, WALKTHROUGH_PENS, STROKE_POINTS_MAX } from '@shared/walkthrough'
import type { ComputerInvokeContract } from '@shared/ipc/computer.contract'
import type { WalkthroughInvokeContract } from '@shared/ipc/walkthrough.contract'

import { askComputerPermission } from '../computer/computer-access'
import type { ComputerRuntime } from '../computer/computer-runtime'
import type { InvokeHandlers } from './handle'
import { assertOneOf } from './validate'

type ComputerChannels = keyof ComputerInvokeContract | keyof WalkthroughInvokeContract

const ACTIONS = ['pause', 'resume', 'stop'] as const

const PERMISSIONS = ['accessibility', 'screen'] as const

/** Точка пометки из окна меток: числа в разумных пределах окна во весь дисплей. */
const isPoint = (value: unknown): value is MarkPoint => {
  if (typeof value !== 'object' || value === null) return false

  const { x, y } = value as Record<string, unknown>

  return (
    typeof x === 'number' && typeof y === 'number' && [x, y].every((n) => Math.abs(n) < 100_000)
  )
}

/** Пометка человека: инструмент из списка и от двух до STROKE_POINTS_MAX точек. */
const assertStroke = (
  pen: unknown,
  points: unknown,
): { pen: WalkthroughPen; points: MarkPoint[] } => {
  const isList =
    Array.isArray(points) &&
    points.length >= 2 &&
    points.length <= STROKE_POINTS_MAX &&
    points.every(isPoint)

  if (!isWalkthroughPen(pen) || !isList) throw new Error('Недопустимая пометка показа')

  return { pen, points: points.map(({ x, y }) => ({ x, y })) }
}

/**
 * Каналы Computer Use (ADR 0057): кнопки капсулы, запрос разрешений macOS, метки показа
 * Walkthrough поверх экрана (ADR 0134) и инструменты человека в нём (ADR 0135) - его окна
 * Computer Use держит само.
 */
export const createComputerHandlers = (
  computer: ComputerRuntime,
): Pick<InvokeHandlers, ComputerChannels> => ({
  'computer:capsule': () => computer.capsuleView(),
  'computer:control': ({ action }) => computer.control(assertOneOf(action, ACTIONS, 'action')),
  'computer:allow': ({ permission }) =>
    askComputerPermission(assertOneOf(permission, PERMISSIONS, 'permission')),
  'walkthrough:view': () => computer.walkthroughView(),
  'walkthrough:panel': () => computer.walkthroughPanel(),
  'walkthrough:pick': ({ pen }) =>
    computer.walkthrough.pick(pen === null ? null : assertOneOf(pen, WALKTHROUGH_PENS, 'pen')),
  'walkthrough:erase': () => computer.walkthrough.erase(),
  'walkthrough:stroke': ({ pen, points }) => {
    const stroke = assertStroke(pen, points)

    computer.walkthroughStroke(stroke.pen, stroke.points)
  },
})

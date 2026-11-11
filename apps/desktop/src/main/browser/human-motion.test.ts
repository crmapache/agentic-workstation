import { it, expect, describe } from 'vitest'

import {
  keyGapMs,
  aimInside,
  humanPath,
  wheelTicks,
  minimumJerk,
  moveDurationOf,
} from './human-motion'
import type { Random, MoveStep } from './human-motion'

/** Повторяемая случайность: линейный конгруэнтный генератор от зерна. */
const seeded = (seed: number): Random => {
  let state = seed

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32

    return state / 2 ** 32
  }
}

const speeds = (steps: readonly MoveStep[]) =>
  steps.slice(1).map((step, index) => {
    const previous = steps[index] as MoveStep

    return Math.hypot(step.x - previous.x, step.y - previous.y) / Math.max(1, step.at - previous.at)
  })

describe('рука человека', () => {
  it('путь кончается ровно в цели, время идёт вперёд, шаги - кадрами', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const steps = humanPath({ x: 100, y: 500 }, { x: 900, y: 120 }, seeded(seed))

      expect(steps.at(-1)).toMatchObject({ x: 900, y: 120 })
      expect(
        steps.every((step, index) => index === 0 || step.at > (steps[index - 1]?.at ?? 0)),
      ).toBe(true)
      expect(steps.length).toBeGreaterThan(10)
    }
  })

  it('не прямая и не равномерная: дуга в сторону, разгон и торможение', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 600, y: 0 }
    const steps = humanPath(from, to, seeded(7))
    const middle = speeds(steps).slice(2, -4)

    expect(Math.max(...steps.map((step) => Math.abs(step.y)))).toBeGreaterThan(10)
    // Посередине пути рука быстрее, чем в начале.
    expect(Math.max(...middle)).toBeGreaterThan(2 * (speeds(steps)[0] ?? 0))
  })

  it('дальнее и мелкое - дольше, но в пределах: агент не ждёт руку секундами', () => {
    const random = () => 0.5

    expect(moveDurationOf(50, random)).toBeLessThan(moveDurationOf(800, random))
    expect(moveDurationOf(1, random)).toBeGreaterThanOrEqual(120)
    expect(moveDurationOf(5000, random)).toBeLessThanOrEqual(900)
  })

  it('совсем рядом - один шаг', () => {
    expect(humanPath({ x: 10, y: 10 }, { x: 10.4, y: 10 }, seeded(1))).toEqual([
      { x: 10.4, y: 10, at: 0 },
    ])
  })

  it('профиль минимального рывка: от 0 до 1, медленно на краях', () => {
    expect(minimumJerk(0)).toBe(0)
    expect(minimumJerk(1)).toBe(1)
    expect(minimumJerk(0.1)).toBeLessThan(0.1)
    expect(minimumJerk(0.5)).toBeCloseTo(0.5)
  })

  it('точка нажатия - рядом с серединой и всегда внутри элемента', () => {
    const box = { x: 100, y: 200, width: 12, height: 12 }
    const random = seeded(3)
    const points = Array.from({ length: 200 }, () => aimInside(box, random))

    expect(points.every((point) => point.x >= 100 && point.x <= 112)).toBe(true)
    expect(points.every((point) => point.y >= 200 && point.y <= 212)).toBe(true)
    expect(new Set(points.map((point) => `${point.x},${point.y}`)).size).toBeGreaterThan(3)

    const wide = Array.from({ length: 200 }, () =>
      aimInside({ x: 0, y: 0, width: 800, height: 400 }, random),
    )

    // У крупного элемента - не дальше потолка от середины: угловые кнопки внутри не задеть.
    expect(wide.every((point) => Math.abs(point.x - 400) <= 18)).toBe(true)
  })

  it('колесо - толчками, крупные сначала, сумма ровно та, что просили', () => {
    const ticks = wheelTicks(0, 900)

    expect(ticks.reduce((sum, tick) => sum + tick.dy, 0)).toBe(900)
    expect(ticks.length).toBeGreaterThan(3)
    expect(ticks[0]?.dy).toBeGreaterThan(ticks.at(-1)?.dy ?? 0)
    expect(wheelTicks(-40, 0).reduce((sum, tick) => sum + tick.dx, 0)).toBe(-40)
  })

  it('после слова рука задерживается дольше, чем внутри слова', () => {
    const inside = keyGapMs('a', () => 0.5)
    const afterWord = keyGapMs(' ', () => 0.5)

    expect(afterWord).toBeGreaterThan(inside)
  })
})

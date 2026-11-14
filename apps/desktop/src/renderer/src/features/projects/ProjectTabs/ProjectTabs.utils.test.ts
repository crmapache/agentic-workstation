import { it, expect, describe } from 'vitest'

import type { TabSlot } from './ProjectTabs.types'
import {
  beforeOf,
  nextPlace,
  shiftsFor,
  clampOffset,
  landingOffset,
  autoScrollStep,
} from './ProjectTabs.utils'

/** Три вкладки по 100 пикселей с зазором 4: 0-100, 104-204, 208-308. */
const SLOTS: TabSlot[] = [
  { id: 'a', left: 0, width: 100 },
  { id: 'b', left: 104, width: 100 },
  { id: 'c', left: 208, width: 100 },
]

describe('перетаскивание вкладок проектов', () => {
  it('вкладка не уходит за края ряда', () => {
    expect(clampOffset(SLOTS, 0, -50)).toBe(0)
    expect(clampOffset(SLOTS, 0, 500)).toBe(208)
    expect(clampOffset(SLOTS, 1, 60)).toBe(60)
  })

  it('место меняется, когда передний край миновал середину соседа, и с запасом', () => {
    // Середина b - 154, правый край a - 100: на сдвиге 70 край на 170, b пройдена с запасом.
    expect(nextPlace(SLOTS, 0, 0, 70, 8)).toBe(1)
    // На 60 край на 160: b пройдена, но меньше чем на запас - место прежнее.
    expect(nextPlace(SLOTS, 0, 0, 60, 8)).toBe(0)
    // У самого края ряда - последнее место, и обратно - первое.
    expect(nextPlace(SLOTS, 0, 0, 208, 8)).toBe(2)
    expect(nextPlace(SLOTS, 2, 2, -208, 8)).toBe(0)
    // Вернулась назад, но не дальше запаса - остаётся, где встала.
    expect(nextPlace(SLOTS, 0, 1, 50, 8)).toBe(1)
    expect(nextPlace(SLOTS, 0, 1, 40, 8)).toBe(0)
  })

  it('соседи уступают место на ширину несомой и зазор', () => {
    expect(shiftsFor(SLOTS, 0, 2)).toEqual({ b: -104, c: -104 })
    expect(shiftsFor(SLOTS, 2, 0)).toEqual({ a: 104, b: 104 })
    expect(shiftsFor(SLOTS, 1, 1)).toEqual({})
  })

  it('брошенная вкладка доезжает ровно на место той, чьё место заняла', () => {
    expect(landingOffset(SLOTS, 0, 2)).toBe(208)
    expect(landingOffset(SLOTS, 2, 0)).toBe(-208)
    expect(landingOffset(SLOTS, 1, 1)).toBe(0)
  })

  it('перед кем встать - по ряду без несомой; последнее место - конец', () => {
    const ids = SLOTS.map((slot) => slot.id)

    expect(beforeOf(ids, 2, 0)).toBe('a')
    expect(beforeOf(ids, 0, 1)).toBe('c')
    expect(beforeOf(ids, 0, 2)).toBeNull()
  })

  it('ряд едет за рукой у края, быстрее у самого края, и только если есть куда', () => {
    const box = { left: 0, right: 500 }
    const room = { before: 100, after: 100 }

    expect(autoScrollStep(250, box, room, 32, 12)).toBe(0)
    expect(autoScrollStep(0, box, room, 32, 12)).toBe(-12)
    expect(autoScrollStep(484, box, room, 32, 12)).toBe(6)
    expect(autoScrollStep(0, box, { before: 0, after: 100 }, 32, 12)).toBe(0)
    expect(autoScrollStep(500, box, { before: 100, after: 3 }, 32, 12)).toBe(3)
  })
})

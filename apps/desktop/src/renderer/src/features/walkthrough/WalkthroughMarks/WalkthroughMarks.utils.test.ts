import { it, expect, describe } from 'vitest'

import { CUTOUT_PAD, POINT_STEP, ARROW_STROKE } from './WalkthroughMarks.constants'
import {
  cutoutOf,
  arrowShape,
  nextPoints,
  smoothPath,
  spotlightPath,
} from './WalkthroughMarks.utils'

const BOX = { x: 100, y: 200, width: 120, height: 30 }

describe('walkthrough marks drawing', () => {
  it('builds a smooth path through the points', () => {
    expect(smoothPath([])).toBe('')
    expect(
      smoothPath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toBe('M0 0 Q10 0 10 5 L10 10')
  })

  it('points the arrow head at the tip and keeps the shaft behind it, like Shotter', () => {
    const tip = { x: 400, y: 300 }
    const shape = arrowShape({ x: 200, y: 400 }, tip, ARROW_STROKE)

    expect(shape.head[0]).toEqual(tip)
    expect(shape.tail.center).toEqual({ x: 200, y: 400 })
    expect(shape.tail.radius).toBeCloseTo(Math.max(1.2, ARROW_STROKE * 0.38) / 2)
    for (const point of shape.shaft)
      expect(Math.hypot(point.x - tip.x, point.y - tip.y)).toBeGreaterThan(10)
  })

  it('dims the whole window but a rounded hole around each highlight', () => {
    const one = spotlightPath(1000, 800, [BOX])

    expect(one.startsWith('M0 0 H1000 V800 H0 Z')).toBe(true)
    expect(one).toContain(`M${BOX.x - CUTOUT_PAD + 10} ${BOX.y - CUTOUT_PAD}`)
    expect(spotlightPath(1000, 800, [BOX, { ...BOX, y: 500 }]).match(/Z/g)).toHaveLength(3)
  })

  // Переход CSS по `d` ведёт вырез к новому месту, только если путь той же формы (ADR 0135).
  it('keeps the same path shape when one highlight replaces another', () => {
    const shape = (path: string) => path.replace(/-?[\d.]+/g, '0')

    expect(shape(spotlightPath(1000, 800, [BOX]))).toBe(
      shape(spotlightPath(1000, 800, [{ x: 600, y: 50, width: 20, height: 400 }])),
    )
  })

  it('rounds a cutout no more than half its side', () => {
    expect(cutoutOf({ x: 10, y: 10, width: 0, height: 0 }).radius).toBe(CUTOUT_PAD)
    expect(cutoutOf(BOX)).toMatchObject({ x: 90, y: 190, width: 140, height: 50 })
  })

  it('keeps the hand path sparse, and only the ends of a straight mark', () => {
    const start = [{ x: 0, y: 0 }]

    expect(nextPoints(start, { x: POINT_STEP - 1, y: 0 }, false)).toEqual(start)
    expect(nextPoints(start, { x: POINT_STEP + 1, y: 0 }, false)).toHaveLength(2)
    expect(
      nextPoints(
        [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
        { x: 40, y: 2 },
        true,
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 2 },
    ])
    expect(nextPoints([], { x: 1, y: 1 }, true)).toEqual([{ x: 1, y: 1 }])
  })
})

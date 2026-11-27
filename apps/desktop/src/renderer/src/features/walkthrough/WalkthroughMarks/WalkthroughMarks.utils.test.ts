import { it, expect, describe } from 'vitest'

import { ARROW_STROKE } from './WalkthroughMarks.constants'
import {
  noise,
  arrowShape,
  keepInside,
  smoothPath,
  circlePoints,
  spotlightPath,
} from './WalkthroughMarks.utils'

const BOX = { x: 100, y: 200, width: 120, height: 30 }

/** Лежит ли точка внутри замкнутой ломаной (луч вправо). */
const isInside = (point: { x: number; y: number }, ring: { x: number; y: number }[]): boolean =>
  ring.reduce((inside, a, index) => {
    const b = ring[(index + 1) % ring.length] ?? a
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x

    return crosses ? !inside : inside
  }, false)

describe('walkthrough marks drawing', () => {
  it('repeats the same hand-drawn shape for the same mark and changes it for the next one', () => {
    expect(circlePoints(BOX, 3)).toEqual(circlePoints(BOX, 3))
    expect(circlePoints(BOX, 3)).not.toEqual(circlePoints(BOX, 4))
    expect(noise(1, 1)).toBeGreaterThanOrEqual(0)
    expect(noise(1, 1)).toBeLessThan(1)
  })

  it('circles the whole box, corners too, and overshoots its start', () => {
    const loop = circlePoints(BOX, 7)
    const corners = [
      { x: BOX.x, y: BOX.y },
      { x: BOX.x + BOX.width, y: BOX.y },
      { x: BOX.x, y: BOX.y + BOX.height },
      { x: BOX.x + BOX.width, y: BOX.y + BOX.height },
    ]

    for (const corner of corners) expect(isInside(corner, loop)).toBe(true)

    const [first] = loop
    const last = loop.at(-1)

    expect(first && last && Math.hypot(first.x - last.x, first.y - last.y)).toBeGreaterThan(5)
  })

  it('makes a small icon a loop, not a dot', () => {
    const loop = circlePoints({ x: 50, y: 50, width: 4, height: 4 }, 1)
    const xs = loop.map((point) => point.x)

    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(30)
  })

  it('presses a loop at the screen edge against it instead of cutting it off', () => {
    const loop = keepInside(
      circlePoints({ x: 1700, y: 2, width: 60, height: 15 }, 2),
      1920,
      1080,
      5,
    )

    expect(Math.min(...loop.map((point) => point.y))).toBe(5)
    expect(Math.max(...loop.map((point) => point.x))).toBeLessThanOrEqual(1915)
  })

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

  it('dims the whole window but a rounded hole around the box', () => {
    const path = spotlightPath(1000, 800, BOX)

    expect(path.startsWith('M0 0 H1000 V800 H0 Z')).toBe(true)
    expect(path).toContain('M100 188')
  })
})

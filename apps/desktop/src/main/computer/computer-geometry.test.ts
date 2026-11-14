import { it, expect, describe } from 'vitest'

import { toShot, regionOf, shotSize, toScreen, displayAt, isSameDisplay } from './computer-geometry'
import type { Display, ShotFrame } from './computer-geometry'
import { SHOT_MAX_SIDE, SHOT_MAX_PIXELS } from './computer.constants'

const MAIN: Display = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1512, height: 982 },
  scaleFactor: 2,
  isMain: true,
}

/** Второй дисплей слева от главного и выше: координаты macOS у него отрицательные. */
const SIDE: Display = {
  id: 2,
  bounds: { x: -1920, y: -200, width: 1920, height: 1080 },
  scaleFactor: 1,
  isMain: false,
}

const frameOf = (display: Display): ShotFrame => ({ display, ...shotSize(display.bounds) })

describe('screenshot geometry', () => {
  it('keeps the screenshot inside what the API takes without shrinking it', () => {
    for (const display of [MAIN, SIDE]) {
      const size = shotSize(display.bounds)

      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(SHOT_MAX_SIDE)
      expect(size.width * size.height).toBeLessThanOrEqual(SHOT_MAX_PIXELS)
      expect(size.width / size.height).toBeCloseTo(display.bounds.width / display.bounds.height, 2)
    }

    expect(shotSize({ x: 0, y: 0, width: 800, height: 600 })).toEqual({ width: 800, height: 600 })
  })

  it('maps a screenshot pixel to the screen point and back, on a display left of the main one', () => {
    const frame = { display: SIDE, width: 960, height: 540 }
    const point = toScreen(frame, 480, 270)

    expect(point).toEqual({ x: -960, y: 340 })
    expect(toShot(frame, point)).toEqual({ x: 480, y: 270 })
    expect(toShot(frameOf(SIDE), toScreen(frameOf(SIDE), 700, 400))).toEqual({ x: 700, y: 400 })
  })

  it('pins a point past the edge to the display instead of the neighbour', () => {
    const frame = frameOf(MAIN)

    expect(toScreen(frame, frame.width + 50, -10)).toEqual({ x: 1511, y: 0 })
    expect(toShot(frame, { x: -5, y: 10 })).toBeNull()
  })

  it('turns a region of the screenshot into screen points, corners in any order', () => {
    const frame = { display: MAIN, width: 756, height: 491 }

    expect(regionOf(frame, [100, 50, 10, 5])).toEqual({ x: 20, y: 10, width: 180, height: 90 })
  })

  it('finds the display under a point, the main one when the point is off every screen', () => {
    expect(displayAt([MAIN, SIDE], { x: -100, y: 0 })?.id).toBe(2)
    expect(displayAt([MAIN, SIDE], { x: 5000, y: 5000 })?.id).toBe(1)
  })

  it('trusts a screenshot only while its display stays the same', () => {
    expect(isSameDisplay(MAIN, { ...MAIN })).toBe(true)
    expect(isSameDisplay(MAIN, undefined)).toBe(false)
    expect(isSameDisplay(MAIN, { ...MAIN, scaleFactor: 1 })).toBe(false)
    expect(isSameDisplay(MAIN, { ...MAIN, bounds: { ...MAIN.bounds, width: 1728 } })).toBe(false)
    expect(isSameDisplay(SIDE, { ...SIDE, bounds: { ...SIDE.bounds, x: 1512 } })).toBe(false)
  })
})

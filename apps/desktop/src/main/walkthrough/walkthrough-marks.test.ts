import { it, expect, describe } from 'vitest'

import {
  boxOf,
  markIn,
  movedBy,
  pointsOf,
  anchorsOf,
  arrowTail,
  ARROW_LENGTH,
} from './walkthrough-marks'

const DISPLAY = { x: 0, y: 0, width: 1000, height: 800 }

describe('walkthrough marks', () => {
  it('takes a box from two corners in any order', () => {
    expect(
      boxOf([
        { x: 60, y: 30 },
        { x: 10, y: 10 },
      ]),
    ).toEqual({ x: 10, y: 10, width: 50, height: 20 })
  })

  it('moves every point of a request from screenshot pixels to the screen', () => {
    const arrow = { kind: 'arrow' as const, to: { x: 1, y: 2 }, from: { x: 3, y: 4 } }
    const doubled = movedBy(arrow, (point) => ({ x: point.x * 2, y: point.y * 2 }))

    expect(doubled).toEqual({ kind: 'arrow', to: { x: 2, y: 4 }, from: { x: 6, y: 8 } })
    expect(pointsOf(doubled)).toEqual([
      { x: 2, y: 4 },
      { x: 6, y: 8 },
    ])
    expect(pointsOf({ kind: 'arrow', to: { x: 1, y: 2 }, from: null })).toEqual([{ x: 1, y: 2 }])
  })

  it('starts an arrow without a tail towards the middle of the display, inside it', () => {
    const tail = arrowTail({ x: 900, y: 700 }, DISPLAY)

    expect(tail.x).toBeLessThan(900)
    expect(tail.y).toBeLessThan(700)
    expect(Math.hypot(900 - tail.x, 700 - tail.y)).toBeCloseTo(ARROW_LENGTH, 0)

    const corner = arrowTail({ x: 5, y: 5 }, DISPLAY)

    expect(corner.x).toBeGreaterThanOrEqual(24)
    expect(corner.y).toBeGreaterThanOrEqual(24)
  })

  it('puts marks into points of the marks window', () => {
    const origin = { x: 1000, y: 25 }
    const display = { x: 1000, y: 0, width: 1500, height: 900 }

    expect(
      markIn(
        {
          kind: 'circle',
          corners: [
            { x: 1100, y: 125 },
            { x: 1200, y: 175 },
          ],
        },
        4,
        display,
        origin,
      ),
    ).toEqual({ kind: 'circle', id: 4, box: { x: 100, y: 100, width: 100, height: 50 } })
    expect(
      markIn(
        { kind: 'arrow', to: { x: 1100, y: 125 }, from: { x: 1300, y: 325 } },
        5,
        display,
        origin,
      ),
    ).toEqual({ kind: 'arrow', id: 5, from: { x: 300, y: 300 }, to: { x: 100, y: 100 } })
  })

  it('watches the middle and the corners of an area and the tip of an arrow', () => {
    expect(
      anchorsOf({
        kind: 'spotlight',
        corners: [
          { x: 0, y: 0 },
          { x: 10, y: 20 },
        ],
      }),
    ).toEqual([
      { x: 5, y: 10 },
      { x: 0, y: 0 },
      { x: 10, y: 20 },
    ])
    expect(anchorsOf({ kind: 'arrow', to: { x: 3, y: 4 }, from: null })).toEqual([{ x: 3, y: 4 }])
  })
})

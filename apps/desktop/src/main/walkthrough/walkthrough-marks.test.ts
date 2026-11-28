import { it, expect, describe } from 'vitest'

import {
  boxOf,
  isDrawn,
  boundsOf,
  closeUpOf,
  boxAnchors,
  strokeText,
  strokeAnchors,
} from './walkthrough-marks'

const LINE = [
  { x: 100, y: 200 },
  { x: 300, y: 204 },
]

describe('walkthrough geometry (ADR 0135)', () => {
  it('makes a box of two corners in any order, and of a hand path', () => {
    expect(
      boxOf([
        { x: 60, y: 30 },
        { x: 10, y: 10 },
      ]),
    ).toEqual({ x: 10, y: 10, width: 50, height: 20 })
    expect(
      boundsOf([
        { x: 5, y: 9 },
        { x: 1, y: 20 },
        { x: 8, y: 2 },
      ]),
    ).toEqual({
      x: 1,
      y: 2,
      width: 7,
      height: 18,
    })
    expect(boundsOf([])).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  it('checks a highlight by its middle and corners, an arrow by its tip', () => {
    expect(boxAnchors({ x: 0, y: 0, width: 10, height: 20 })).toEqual([
      { x: 5, y: 10 },
      { x: 0, y: 0 },
      { x: 10, y: 20 },
    ])
    expect(strokeAnchors('arrow', LINE)).toEqual([{ x: 300, y: 204 }])
    expect(strokeAnchors('underline', LINE)).toEqual([{ x: 200, y: 202 }])
  })

  it('looks closely at the text above an underline and around an arrow tip', () => {
    const underline = closeUpOf('underline', LINE)
    const outline = closeUpOf('outline', LINE)

    expect(underline.y).toBeLessThan(outline.y)
    expect(underline.y + underline.height).toBe(outline.y + outline.height)

    const arrow = closeUpOf('arrow', LINE)

    expect(arrow.x + arrow.width / 2).toBe(300)
    expect(arrow.y + arrow.height / 2).toBe(204)
  })

  it('tells the model each mark in words', () => {
    expect(strokeText('arrow', LINE)).toBe('drew an arrow from (100, 200) pointing at (300, 204)')
    expect(strokeText('underline', LINE)).toBe('underlined from (100, 200) to (300, 204)')
    expect(
      strokeText('outline', [
        { x: 10, y: 10 },
        { x: 50, y: 5 },
        { x: 30, y: 40 },
      ]),
    ).toBe('circled the area (10, 5)-(50, 40)')
  })

  it('does not keep a click as a mark', () => {
    expect(isDrawn([{ x: 1, y: 1 }])).toBe(false)
    expect(
      isDrawn([
        { x: 1, y: 1 },
        { x: 4, y: 3 },
      ]),
    ).toBe(false)
    expect(isDrawn(LINE)).toBe(true)
  })
})

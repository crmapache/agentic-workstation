import { it, expect, describe } from 'vitest'

import type { RoadmapStop } from '@shared/scenario-runs'

import {
  endOf,
  bandOf,
  hereOf,
  widthOf,
  windowed,
  roadWidth,
  roadLayout,
  isLinkPassed,
} from './scenarios-road.utils'

/** Ширины частей при размере текста 100%: в окне их меряют по нарисованному. */
const METRICS = { stop: 18, link: 8, fold: 36 }

const stops = (states: RoadmapStop['state'][], stages: number[] = []): RoadmapStop[] =>
  states.map((state, at) => ({ state, stage: stages[at] ?? 1, pass: 1, title: `card ${at + 1}` }))

describe('road of cards', () => {
  it('stands at the first stop that is not over, and ends where the run ended', () => {
    const road = stops(['done', 'running', 'waiting'])

    expect(hereOf(road)).toBe(1)
    expect(endOf(stops(['done', 'failed', 'skipped']))).toBe(1)
  })

  it('lays every stop out when they fit, and folds the rest around the present', () => {
    expect(
      roadLayout(5, 2, roadWidth(5, METRICS), METRICS).every((item) => item.kind === 'stop'),
    ).toBe(true)

    const folded = roadLayout(18, 9, 200, METRICS)

    expect(folded[0]).toEqual({ kind: 'stop', index: 0 })
    expect(folded.at(-1)).toEqual({ kind: 'stop', index: 17 })
    expect(folded.some((item) => item.kind === 'fold')).toBe(true)
    expect(folded.some((item) => item.kind === 'stop' && item.index === 9)).toBe(true)
  })

  it('folds sooner when the parts grow with the IDE text size', () => {
    const larger = { stop: 27, link: 8, fold: 54 }
    const width = roadWidth(10, METRICS)
    const items = roadLayout(10, 4, width, larger)

    expect(roadLayout(10, 4, width, METRICS).every((item) => item.kind === 'stop')).toBe(true)
    expect(items.some((item) => item.kind === 'fold')).toBe(true)
    expect(widthOf(items, larger)).toBeLessThanOrEqual(width)
  })

  it('leans the window forward', () => {
    const window = windowed(20, 10, 7)
      .filter((item) => item.kind === 'stop')
      .map((item) => item.kind === 'stop' && item.index)

    expect(window).toEqual([0, 8, 9, 10, 11, 12, 13, 14, 19])
  })

  it('underlays the stage the run stands in, not a road of one stage', () => {
    expect(bandOf(stops(['done', 'running', 'waiting', 'waiting'], [1, 2, 2, 3]), 1)).toEqual({
      from: 1,
      to: 2,
    })
    expect(bandOf(stops(['done', 'running']), 1)).toBeNull()
  })

  it('colours a link only between two done stops, a fold by the stops it hides', () => {
    const road = stops(['done', 'done', 'done', 'failed', 'done', 'running'])
    const all = road.map((_, index) => ({ kind: 'stop' as const, index }))

    expect(all.map((_, at) => isLinkPassed(road, all, at))).toEqual([
      false,
      true,
      true,
      false,
      false,
      false,
    ])

    const folded = [
      { kind: 'stop' as const, index: 0 },
      { kind: 'fold' as const, from: 1, to: 3 },
      { kind: 'stop' as const, index: 4 },
    ]

    expect(folded.map((_, at) => isLinkPassed(road, folded, at))).toEqual([false, true, false])
  })
})

import { it, expect, describe } from 'vitest'

import { MINUTE_MS } from '@shared/time-units'

import { estimateTurns } from './turn-estimate'

const span = (start: number, end: number, place: number | null = 1) => ({
  start: start * MINUTE_MS,
  end: end * MINUTE_MS,
  place,
})

const minutes = (segments: { start: number; end: number }[]) =>
  segments.map((segment) => [segment.start / MINUTE_MS, segment.end / MINUTE_MS])

describe('estimateTurns', () => {
  it('does not count a pause longer than the idle gap', () => {
    const segments = estimateTurns([span(0, 3), span(23, 24)], [{ ts: 0, human: true }])

    expect(minutes(segments)).toEqual([
      [0, 3],
      [23, 24],
    ])
  })

  it('bridges a short pause between the main file and a subagent', () => {
    const segments = estimateTurns(
      [span(0, 3), span(5, 12, 2), span(14, 15)],
      [{ ts: 0, human: true }],
    )

    expect(minutes(segments)).toEqual([[0, 15]])
  })

  it('never bridges the wait before a turn start', () => {
    const starts = [
      { ts: 0, human: true },
      { ts: 5 * MINUTE_MS, human: false },
    ]

    expect(minutes(estimateTurns([span(0, 3), span(5, 6)], starts))).toEqual([
      [0, 3],
      [5, 6],
    ])
  })

  it('unites parallel subagents instead of adding them', () => {
    const segments = estimateTurns(
      [span(0, 10), span(2, 8, 2), span(3, 9, 3)],
      [{ ts: 0, human: true }],
    )

    expect(minutes(segments)).toEqual([[0, 10]])
  })

  it('cuts a subagent that kept working past the next human message', () => {
    const starts = [
      { ts: 0, human: true },
      { ts: 6 * MINUTE_MS, human: true },
    ]
    const segments = estimateTurns([span(0, 2), span(1, 9, 2), span(6, 7)], starts)

    expect(minutes(segments)).toEqual([
      [0, 6],
      [6, 9],
    ])
  })

  it('drops zero-length activity', () => {
    expect(estimateTurns([span(4, 4)], [{ ts: 4 * MINUTE_MS, human: true }])).toEqual([])
  })
})

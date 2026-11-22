import { it, expect, describe } from 'vitest'

import { playedMs } from './voice-audio.utils'

describe('playedMs', () => {
  it('counts only what sounded, not the gap while a chunk was late', () => {
    const segments = [
      { start: 1, duration: 0.5 },
      { start: 2, duration: 0.5 },
    ]

    expect(playedMs(segments, 1.25)).toBe(250)
    expect(playedMs(segments, 1.9)).toBe(500)
    expect(playedMs(segments, 2.2)).toBeCloseTo(700)
    expect(playedMs(segments, 9)).toBe(1000)
  })
})

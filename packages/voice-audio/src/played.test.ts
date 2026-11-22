import { describe, expect, it } from 'vitest'

import { EpochClock, playedMs } from './played'

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

describe('EpochClock', () => {
  it('keeps counting across answers of one epoch, past the pause between them', () => {
    const clock = new EpochClock()

    clock.add({ start: 1, duration: 1.5 })
    expect(clock.played(3)).toBe(1500)
    expect(clock.isPlaying).toBe(false)

    clock.add({ start: 10, duration: 6 })
    expect(clock.played(11)).toBe(2500)
    expect(clock.played(20)).toBe(7500)
  })

  it('starts over with a new epoch', () => {
    const clock = new EpochClock()

    clock.add({ start: 1, duration: 1 })
    clock.played(5)
    clock.reset()

    expect(clock.played(5)).toBe(0)
  })
})

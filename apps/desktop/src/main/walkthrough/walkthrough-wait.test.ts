import { it, expect, describe } from 'vitest'

import type { Glance } from '../computer/computer-seen'
import { hasMoved, SETTLED_MS, watchForUser } from './walkthrough-wait'
import type { UserMove } from './walkthrough-wait'

const WINDOWS = [{ id: 1, isOrdinary: true, bounds: { x: 0, y: 0, width: 10, height: 10 } }]

const watch = (limitMs = 60_000) => {
  let glance: Glance = { inputAt: 100, scene: WINDOWS }
  let quiet: number | null = 0
  const timers: Array<{ run: () => void; ms: number }> = []
  const moves: UserMove[] = []
  const stop = watchForUser({
    glance: () => glance,
    quietMs: () => quiet,
    // Сработавший таймер уходит из списка, как настоящий setTimeout.
    timer: (run, ms) => {
      const drop = () => {
        const at = timers.indexOf(entry)

        if (at >= 0) timers.splice(at, 1)
      }
      const entry = {
        run: () => {
          drop()
          run()
        },
        ms,
      }

      timers.push(entry)

      return drop
    },
    limitMs,
    done: (move) => moves.push(move),
  })

  return {
    moves,
    stop,
    timers,
    see: (next: Glance, quietMs: number | null) => {
      glance = next
      quiet = quietMs
    },
    look: () => [...timers].filter((timer) => timer.ms === 400).forEach((timer) => timer.run()),
  }
}

describe('waiting for the person to do a step', () => {
  it('sees input after the start or a changed set of windows', () => {
    const start = { inputAt: 100, scene: WINDOWS }

    expect(hasMoved(start, { inputAt: 100, scene: WINDOWS })).toBe(false)
    expect(hasMoved(start, { inputAt: 900, scene: WINDOWS })).toBe(true)
    expect(hasMoved(start, { inputAt: 100, scene: [] })).toBe(true)
    expect(hasMoved(start, { inputAt: null, scene: null })).toBe(false)
  })

  it('waits while the person is still moving and answers once they are quiet', () => {
    const h = watch()

    h.see({ inputAt: 900, scene: WINDOWS }, 300)
    h.look()
    expect(h.moves).toEqual([])

    h.see({ inputAt: 900, scene: WINDOWS }, SETTLED_MS)
    h.look()
    expect(h.moves).toEqual([{ kind: 'acted' }])
    expect(h.timers).toEqual([])
  })

  it('gives up after the limit', () => {
    const h = watch(30_000)

    h.timers.find((timer) => timer.ms === 30_000)?.run()

    expect(h.moves).toEqual([{ kind: 'timeout' }])
  })

  it('stops quietly when asked', () => {
    const h = watch()

    h.stop()

    expect(h.timers).toEqual([])
    expect(h.moves).toEqual([])
  })
})

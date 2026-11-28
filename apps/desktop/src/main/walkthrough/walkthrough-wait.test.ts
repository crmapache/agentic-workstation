import { it, expect, describe } from 'vitest'

import type { Glance } from '../computer/computer-seen'
import { hasMoved, SETTLED_MS, watchForUser, waitForSilence } from './walkthrough-wait'
import type { UserMove } from './walkthrough-wait'

const WINDOWS = [{ id: 1, isOrdinary: true, bounds: { x: 0, y: 0, width: 10, height: 10 } }]

const watch = (limitMs = 60_000) => {
  let glance: Glance = { inputAt: 100, scene: WINDOWS }
  let quiet: number | null = 0
  let holding = false
  const timers: Array<{ run: () => void; ms: number }> = []
  const moves: UserMove[] = []
  const stop = watchForUser({
    glance: () => glance,
    quietMs: () => quiet,
    isHolding: () => holding,
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
    hold: (on: boolean) => {
      holding = on
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

  // ADR 0135: с инструментом показа в руке человек рисует пометку, а не делает шаг.
  it('does not take drawing with a walkthrough pen for the step', () => {
    const h = watch()

    h.hold(true)
    h.see({ inputAt: 900, scene: WINDOWS }, SETTLED_MS)
    h.look()
    expect(h.moves).toEqual([])

    h.hold(false)
    h.look()
    expect(h.moves).toEqual([{ kind: 'acted' }])
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

describe('waiting for an answer in silence (ADR 0135)', () => {
  const silence = (ms: number) => {
    let hearing = false
    let calls = 0
    const timers: Array<() => void> = []
    const stop = waitForSilence({
      isHearing: () => hearing,
      timer: (run) => {
        timers.push(run)

        return () => timers.splice(timers.indexOf(run), 1)
      },
      ms,
      done: () => {
        calls += 1
      },
    })
    const tick = (times: number) => {
      for (let step = 0; step < times; step += 1) timers.shift()?.()
    }

    return {
      stop,
      tick,
      timers,
      done: () => calls,
      hear: (on: boolean) => {
        hearing = on
      },
    }
  }

  it('says silence after the time with no words', () => {
    const h = silence(1000)

    h.tick(3)
    expect(h.done()).toBe(0)
    h.tick(1)
    expect(h.done()).toBe(1)
    expect(h.timers).toEqual([])
  })

  it('does not count the time while the person speaks', () => {
    const h = silence(1000)

    h.tick(3)
    h.hear(true)
    h.tick(10)
    expect(h.done()).toBe(0)

    h.hear(false)
    h.tick(3)
    expect(h.done()).toBe(0)
    h.tick(1)
    expect(h.done()).toBe(1)
  })

  it('stops quietly when asked', () => {
    const h = silence(1000)

    h.stop()

    expect(h.timers).toEqual([])
  })
})

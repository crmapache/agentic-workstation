import { it, vi, expect, describe } from 'vitest'

import type { Display } from './computer-geometry'
import { ageOf, glance, outdated, changedSince } from './computer-seen'
import type { Seen } from './computer-seen'
import type { SceneWindow } from './screen-scene'

const DISPLAY: Display = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
  isMain: true,
}

const window = (id: number, x: number, y: number, isOrdinary = true): SceneWindow => ({
  id,
  isOrdinary,
  bounds: { x, y, width: 400, height: 300 },
})

const DOCK: SceneWindow = { id: 9, isOrdinary: false, bounds: DISPLAY.bounds }

/** Снимок: Dock сверху, браузер под ним в (0, 0), чат - в (1000, 0). */
const seen = (over: Partial<Seen> = {}): Seen => ({
  frame: { display: DISPLAY, width: 1920, height: 1080 },
  at: 1_000_000,
  pauses: 0,
  letGos: 0,
  inputAt: 5000,
  scene: [DOCK, window(1, 0, 0), window(2, 1000, 0)],
  ...over,
})

const DESK = { pauses: 0, letGos: 0 }

describe('is the latest screenshot still true before an action', () => {
  it('passes a fresh screenshot of the same display', () => {
    expect(outdated(seen(), DESK, DISPLAY, 1_005_000)).toBeNull()
  })

  it('refuses without a screenshot, after a pause, after a break and on another display', () => {
    expect(outdated(undefined, DESK, DISPLAY, 0)).toMatch(/no screenshot/)
    expect(outdated(seen(), { ...DESK, pauses: 1 }, DISPLAY, 0)).toMatch(/paused you/)
    expect(outdated(seen(), DESK, { ...DISPLAY, scaleFactor: 2 }, 0)).toMatch(/displays changed/)
    expect(outdated(seen(), DESK, undefined, 0)).toMatch(/displays changed/)
  })

  it('after a break says how old the screenshot is', () => {
    const reason = outdated(seen(), { ...DESK, letGos: 1 }, DISPLAY, 1_000_000 + 4 * 60_000)

    expect(reason).toBe(
      'Your latest screenshot is 4 min old and from before a break: you stopped using the ' +
        'computer, and the user may have used it since.',
    )
  })

  it('names the age in seconds, minutes and hours', () => {
    expect(ageOf(12_400)).toBe('12 s')
    expect(ageOf(5 * 60_000)).toBe('5 min')
    expect(ageOf(3 * 3_600_000)).toBe('3 h')
    expect(ageOf(-5)).toBe('0 s')
  })
})

describe('what changed on the screen since the screenshot', () => {
  const now = (over: Partial<ReturnType<typeof glance>> = {}) => ({
    inputAt: 5000,
    scene: [DOCK, window(1, 0, 0), window(2, 1000, 0)],
    ...over,
  })

  it('nothing - the action goes', () => {
    expect(changedSince(seen(), now(), [{ x: 100, y: 100 }])).toBeNull()
    expect(changedSince(seen(), now(), [])).toBeNull()
  })

  it('the user touched the mouse or keyboard after the screenshot', () => {
    expect(changedSince(seen(), now({ inputAt: 7400 }), [{ x: 100, y: 100 }])).toMatch(
      /used the mouse or keyboard/,
    )
    // Те же «сколько назад», прочитанные дважды, расходятся на миллисекунды - это не ввод.
    expect(changedSince(seen(), now({ inputAt: 5020 }), [])).toBeNull()
  })

  it('a window opened over the point - but not one opened elsewhere', () => {
    const opened = now({ scene: [DOCK, window(3, 50, 50), window(1, 0, 0), window(2, 1000, 0)] })

    expect(changedSince(seen(), opened, [{ x: 100, y: 100 }])).toMatch(/windows where you aimed/)
    expect(changedSince(seen(), opened, [{ x: 1200, y: 100 }])).toBeNull()
  })

  it('the window at the point moved, or another one came to the front there', () => {
    const moved = now({ scene: [DOCK, window(1, 40, 0), window(2, 1000, 0)] })
    const front = now({ scene: [DOCK, window(2, 0, 0), window(1, 0, 0)] })

    expect(changedSince(seen(), moved, [{ x: 100, y: 100 }])).toMatch(/windows where you aimed/)
    expect(changedSince(seen(), front, [{ x: 100, y: 100 }])).toMatch(/windows where you aimed/)
  })

  it('a drag checks both ends', () => {
    const opened = now({ scene: [DOCK, window(3, 1000, 0), window(1, 0, 0), window(2, 1000, 0)] })

    expect(
      changedSince(seen(), opened, [
        { x: 100, y: 100 },
        { x: 1100, y: 100 },
      ]),
    ).toMatch(/windows where you aimed/)
  })

  it('keys: another window came to the front', () => {
    const front = now({ scene: [DOCK, window(2, 1000, 0), window(1, 0, 0)] })

    expect(changedSince(seen(), front, [])).toBe(
      'Another window came to the front after your latest screenshot, and the keys would go there.',
    )
  })

  it('what the witness could not tell is not checked', () => {
    const opened = now({ inputAt: null, scene: null })

    expect(changedSince(seen({ inputAt: null }), now({ inputAt: 9000 }), [])).toBeNull()
    expect(changedSince(seen(), opened, [{ x: 100, y: 100 }])).toBeNull()
    expect(changedSince(seen({ scene: null }), now(), [])).toBeNull()
  })
})

describe('glance at the screen', () => {
  it('turns "how long ago" into the time of the last input', () => {
    const scene = [window(1, 0, 0)]

    expect(glance({ scene: () => scene, idleMs: () => 1500 }, 10_000)).toEqual({
      inputAt: 8500,
      scene,
    })
  })

  it('a failing witness does not stop the work: that part is just unknown', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(
      glance(
        {
          scene: () => {
            throw new Error('koffi failed')
          },
          idleMs: () => null,
        },
        10_000,
      ),
    ).toEqual({ inputAt: null, scene: null })
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})

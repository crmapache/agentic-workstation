import { it, expect, describe } from 'vitest'

import { sceneOf, stackAt, isSameStack } from './screen-scene'
import type { RawWindow, SceneWindow } from './screen-scene'

const OWN_PID = 100

const raw = (window: Partial<RawWindow> & Pick<RawWindow, 'id'>): RawWindow => ({
  pid: 1,
  isOrdinary: true,
  isShown: true,
  isCaptured: true,
  bounds: { x: 0, y: 0, width: 100, height: 100 },
  ...window,
})

const at = (id: number, x: number, y: number, isOrdinary = true): SceneWindow => ({
  id,
  isOrdinary,
  bounds: { x, y, width: 100, height: 100 },
})

describe('screen scene', () => {
  it('keeps what a screenshot shows and drops our own windows hidden from it', () => {
    const scene = sceneOf(
      [
        // Стрелка ИИ: своё окно, закрытое от захвата - его нет на снимке, и оно ездит за рукой.
        raw({ id: 1, pid: OWN_PID, isOrdinary: false, isCaptured: false }),
        // Главное окно IDE видно на снимке - по нему агент тоже работает.
        raw({ id: 2, pid: OWN_PID }),
        // Закрытое от захвата окно другого приложения клик всё равно получит.
        raw({ id: 3, isCaptured: false }),
        raw({ id: 4, isShown: false }),
        raw({ id: 5, bounds: { x: 0, y: 0, width: 0, height: 40 } }),
      ],
      OWN_PID,
    )

    expect(scene.map((window) => window.id)).toEqual([2, 3])
    expect(scene[0]).toEqual({
      id: 2,
      isOrdinary: true,
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    })
  })

  it('a point sees the windows above it down to the first ordinary one', () => {
    const dock = { id: 1, isOrdinary: false, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }
    const scene = [dock, at(2, 500, 500, false), at(3, 0, 0), at(4, 0, 0), at(5, 520, 520)]

    expect(stackAt(scene, { x: 50, y: 50 }).map((window) => window.id)).toEqual([1, 3])
    expect(stackAt(scene, { x: 550, y: 550 }).map((window) => window.id)).toEqual([1, 2, 5])
    expect(stackAt(scene, { x: 1500, y: 900 }).map((window) => window.id)).toEqual([1])
    // Без точки - то, что перед клавиатурой: всё сверху до первого обычного окна.
    expect(stackAt(scene, null).map((window) => window.id)).toEqual([1, 2, 3])
  })

  it('the stack is the same only with the same windows in the same order and place', () => {
    expect(isSameStack([at(1, 0, 0), at(2, 0, 0)], [at(1, 0, 0), at(2, 0, 0)])).toBe(true)
    expect(isSameStack([at(1, 0, 0)], [at(2, 0, 0)])).toBe(false)
    expect(isSameStack([at(1, 0, 0), at(2, 0, 0)], [at(2, 0, 0), at(1, 0, 0)])).toBe(false)
    expect(isSameStack([at(1, 0, 0)], [at(1, 0, 1)])).toBe(false)
    expect(isSameStack([at(1, 0, 0)], [at(1, 0, 0), at(2, 0, 0)])).toBe(false)
    expect(isSameStack([], [])).toBe(true)
  })
})

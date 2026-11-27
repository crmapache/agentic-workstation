import { it, vi, expect, describe } from 'vitest'

import type { Rect } from './computer-geometry'
import { WS_EX_LAYERED, WS_EX_TOPMOST, WS_EX_TRANSPARENT } from './win-input.constants'
import { windowsRows, createWindowsWitness } from './win-scene'
import type { WinSceneNative } from './win-scene'

vi.mock('electron', () => ({ screen: {} }))

const OWN_PID = 100

type FakeWindow = {
  pid?: number
  isVisible?: boolean
  isMinimized?: boolean
  isCloaked?: boolean
  style?: number
  rect?: Rect | null
  affinity?: number | null
}

/** Подделка вызовов Windows: окна по номерам сверху вниз, как их отдаёт EnumWindows. */
const fakeNative = (windows: Record<number, FakeWindow>, idleMs: number | null = 0) => {
  const of = (id: number): FakeWindow => windows[id] ?? {}
  const native: WinSceneNative = {
    windows: () => Object.keys(windows).map(Number),
    isVisible: (id) => of(id).isVisible ?? true,
    isMinimized: (id) => of(id).isMinimized ?? false,
    isCloaked: (id) => of(id).isCloaked ?? false,
    exStyle: (id) => of(id).style ?? 0,
    rect: (id) =>
      of(id).rect === undefined ? { x: 0, y: 0, width: 200, height: 100 } : (of(id).rect ?? null),
    pid: (id) => of(id).pid ?? 1,
    affinity: (id) => (of(id).affinity === undefined ? 0 : (of(id).affinity ?? null)),
    idleMs: () => idleMs,
  }

  return native
}

/** Монитор 150%: пиксели экрана - в точки, как у руки. */
const toDip = (rect: Rect): Rect => ({
  x: rect.x / 1.5,
  y: rect.y / 1.5,
  width: rect.width / 1.5,
  height: rect.height / 1.5,
})

describe('windows scene', () => {
  it('lists what a click can reach, top first, in points of the screen', () => {
    const rows = windowsRows(
      fakeNative({
        1: { style: WS_EX_TOPMOST, rect: { x: 0, y: 1500, width: 3840, height: 60 } },
        2: { isVisible: false },
        3: { isMinimized: true },
        // Приложение Магазина на другом рабочем столе: формально видимо, но скрыто DWM.
        4: { isCloaked: true },
        // Сквозь прозрачное слоёное окно клики проходят - нажатие получит то, что под ним.
        5: { style: WS_EX_TRANSPARENT | WS_EX_LAYERED },
        6: { rect: null },
        7: { pid: 42, rect: { x: 300, y: 150, width: 900, height: 600 } },
      }),
      toDip,
    )

    expect(rows).toEqual([
      {
        id: 1,
        pid: 1,
        isOrdinary: false,
        isShown: true,
        isCaptured: true,
        bounds: { x: 0, y: 1000, width: 2560, height: 40 },
      },
      {
        id: 7,
        pid: 42,
        isOrdinary: true,
        isShown: true,
        isCaptured: true,
        bounds: { x: 200, y: 100, width: 600, height: 400 },
      },
    ])
  })

  it('the witness drops our own windows hidden from capture and passes the input time on', () => {
    const witness = createWindowsWitness(
      () =>
        fakeNative(
          {
            // Капсула: своё окно, закрытое от захвата (WDA_EXCLUDEFROMCAPTURE).
            1: { pid: OWN_PID, style: WS_EX_TOPMOST, affinity: 0x11 },
            2: { pid: OWN_PID },
            // Защиту не узнать - окно считается видимым на снимке.
            3: { affinity: null },
          },
          2500,
        ),
      (rect) => rect,
      OWN_PID,
    )

    expect(witness.scene()?.map((window) => window.id)).toEqual([2, 3])
    expect(witness.idleMs()).toBe(2500)
  })
})

import { screen } from 'electron'

import type { Rect } from './computer-geometry'
import { sceneOf } from './screen-scene'
import type { RawWindow, ScreenWitness } from './screen-scene'
import {
  WDA_NONE,
  GWL_EXSTYLE,
  DWMWA_CLOAKED,
  WS_EX_LAYERED,
  WS_EX_TOPMOST,
  WS_EX_TRANSPARENT,
  LAST_INPUT_INFO_SIZE,
} from './win-input.constants'
import { winStructs } from './win-structs'

/** Вызовы Windows для свидетеля экрана (ADR 0129). Окно - число HWND: его и сравнивают. */
export type WinSceneNative = {
  /** Окна верхнего уровня сверху вниз: EnumWindows идёт по порядку слоёв. */
  windows: () => number[]
  isVisible: (window: number) => boolean
  isMinimized: (window: number) => boolean
  isCloaked: (window: number) => boolean
  exStyle: (window: number) => number
  /** Прямоугольник окна в пикселях экрана; не узнать - null. */
  rect: (window: number) => Rect | null
  pid: (window: number) => number
  /** Защита от захвата (WDA_*); не узнать - null. */
  affinity: (window: number) => number | null
  /** Сколько мс назад был последний ввод; не узнать - null. */
  idleMs: () => number | null
}

/**
 * Окна Windows сверху вниз для сверки: видимые, не свёрнутые, не скрытые DWM и не пропускающие
 * клики насквозь - во что нажатие не уйдёт, то и не сверяется. «Поверх всех» - не обычное окно:
 * оно лежит над окнами приложений, как панели мака. Прямоугольник - в точках экрана, как у руки.
 */
export const windowsRows = (lib: WinSceneNative, toDip: (rect: Rect) => Rect): RawWindow[] =>
  lib.windows().flatMap((window) => {
    if (!lib.isVisible(window) || lib.isMinimized(window) || lib.isCloaked(window)) return []

    const style = lib.exStyle(window)

    if ((style & WS_EX_TRANSPARENT) !== 0 && (style & WS_EX_LAYERED) !== 0) return []

    const rect = lib.rect(window)

    if (!rect) return []

    return [
      {
        id: window,
        pid: lib.pid(window),
        isOrdinary: (style & WS_EX_TOPMOST) === 0,
        isShown: true,
        // Защиту не узнать - считать окно видимым на снимке: лишняя сверка лучше пропущенной.
        isCaptured: (lib.affinity(window) ?? WDA_NONE) === WDA_NONE,
        bounds: toDip(rect),
      },
    ]
  })

/** Свидетель экрана Windows поверх вызовов lib: окна без своих закрытых от захвата и время ввода. */
export const createWindowsWitness = (
  lib: () => WinSceneNative,
  toDip: (rect: Rect) => Rect,
  ownPid: number,
): ScreenWitness => ({
  scene: () => sceneOf(windowsRows(lib(), toDip), ownPid),
  idleMs: () => lib().idleMs(),
})

/**
 * user32, dwmapi и kernel32 через koffi (ADR 0008). HWND - число (uintptr_t), а не указатель:
 * так его можно сравнить между двумя взглядами. Грузятся на первом действии, как вся рука Windows.
 */
const loadWinScene = (): WinSceneNative => {
  const { koffi } = winStructs()
  const user32 = koffi.load('user32.dll')
  const dwmapi = koffi.load('dwmapi.dll')
  const kernel32 = koffi.load('kernel32.dll')
  const RECT = koffi.struct({ left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' })
  const LASTINPUTINFO = koffi.struct({ cbSize: 'uint32', dwTime: 'uint32' })
  const ENUM_PROC = koffi.proto('__stdcall', 'SceneEnumProc', 'int32', ['uintptr_t', 'intptr_t'])
  const outUint = koffi.out(koffi.pointer('uint32'))
  const enumWindows = user32.func('EnumWindows', 'int32', [koffi.pointer(ENUM_PROC), 'intptr_t'])
  const isVisible = user32.func('IsWindowVisible', 'int32', ['uintptr_t'])
  const isIconic = user32.func('IsIconic', 'int32', ['uintptr_t'])
  const windowLong = user32.func('GetWindowLongPtrW', 'intptr_t', ['uintptr_t', 'int32'])
  const windowRect = user32.func('GetWindowRect', 'int32', [
    'uintptr_t',
    koffi.out(koffi.pointer(RECT)),
  ])
  const processId = user32.func('GetWindowThreadProcessId', 'uint32', ['uintptr_t', outUint])
  const displayAffinity = user32.func('GetWindowDisplayAffinity', 'int32', ['uintptr_t', outUint])
  const lastInput = user32.func('GetLastInputInfo', 'int32', [
    koffi.inout(koffi.pointer(LASTINPUTINFO)),
  ])
  const windowAttribute = dwmapi.func('DwmGetWindowAttribute', 'int32', [
    'uintptr_t',
    'uint32',
    koffi.out(koffi.pointer('int32')),
    'uint32',
  ])
  const tickCount = kernel32.func('GetTickCount', 'uint32', [])

  return {
    windows: () => {
      const found: number[] = []

      // Колбэк живёт только на время вызова: EnumWindows зовёт его синхронно.
      enumWindows((window: number | bigint) => {
        found.push(Number(window))

        return 1
      }, 0)

      return found
    },
    isVisible: (window) => Number(isVisible(window)) !== 0,
    isMinimized: (window) => Number(isIconic(window)) !== 0,
    isCloaked: (window) => {
      const cloaked = [0]

      return Number(windowAttribute(window, DWMWA_CLOAKED, cloaked, 4)) === 0 && cloaked[0] !== 0
    },
    exStyle: (window) => Number(windowLong(window, GWL_EXSTYLE)),
    rect: (window) => {
      const rect = { left: 0, top: 0, right: 0, bottom: 0 }

      if (!Number(windowRect(window, rect))) return null

      return {
        x: rect.left,
        y: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
      }
    },
    pid: (window) => {
      const pid = [0]

      processId(window, pid)

      return pid[0] ?? 0
    },
    affinity: (window) => {
      const affinity = [0]

      return Number(displayAffinity(window, affinity)) ? (affinity[0] ?? null) : null
    },
    idleMs: () => {
      const info = { cbSize: LAST_INPUT_INFO_SIZE, dwTime: 0 }

      if (!Number(lastInput(info))) return null

      // Оба счётчика - 32 бита и через 49 дней идут по кругу: разность без знака это переживает.
      return (Number(tickCount()) - info.dwTime) >>> 0
    },
  }
}

let native: WinSceneNative | null = null

/**
 * Свидетель экрана этого Windows: окна и время ввода, вызовы - на первом действии, точки
 * пересчитывает Electron (он знает масштаб каждого монитора).
 */
export const windowsWitness: ScreenWitness = createWindowsWitness(
  () => (native ??= loadWinScene()),
  (rect) => screen.screenToDipRect(null, rect),
  process.pid,
)

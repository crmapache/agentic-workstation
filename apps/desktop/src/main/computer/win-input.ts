import { screen } from 'electron'

import { ComputerError } from './computer-error'
import { LIVE_MOTION } from './computer-hand'
import type { Point, InputDriver } from './computer.types'
import { createWindowsClipboard } from './win-clipboard'
import {
  GA_ROOT,
  VK_LBUTTON,
  VK_RBUTTON,
  TOKEN_QUERY,
  KEY_DOWN_BIT,
  SM_SWAPBUTTON,
  MAPVK_VK_TO_VSC,
  TOKEN_ELEVATION,
  PROCESS_QUERY_LIMITED_INFORMATION,
} from './win-input.constants'
import { keyInput, WinWheel, buttonInput, heldFlagsOf, unicodeInputs } from './win-inputs'
import type { WinInput } from './win-inputs'
import { loadWinNative } from './win-native'
import type { Handle, WinNative } from './win-native'

/** Пересчёт точек: рука считает в DIP Electron, Windows - в пикселях экрана. */
export type WinScreen = {
  toPixels: (at: Point) => Point
  toDip: (at: Point) => Point
}

/**
 * Экран блокировки и защищённый стол запроса администратора (UAC): Windows отказывает в
 * курсоре и вводе всем программам. Без проверки рука думала бы, что действует.
 */
const SECURE_DESKTOP =
  'Windows is showing the lock screen or an administrator prompt: no program can use the mouse ' +
  'and keyboard there. Ask the user to unlock the screen or answer the prompt.'

/** Запущен ли процесс от администратора; не узнать - null. */
const isElevated = (lib: WinNative, process: Handle): boolean | null => {
  const token: Handle[] = [null]

  if (!lib.openProcessToken(process, TOKEN_QUERY, token)) return null

  try {
    const info = [0]

    return lib.tokenInformation(token[0], TOKEN_ELEVATION, info, 4, [0]) ? info[0] !== 0 : null
  } finally {
    lib.closeHandle(token[0])
  }
}

/**
 * Настоящие мышь и клавиатура Windows (ADR 0058) поверх вызовов системы lib: курсор -
 * SetCursorPos (точно до пикселя), кнопки, клавиши, текст и колесо - SendInput. Модификаторы -
 * отдельными клавишами (так жмёт рука), флаги событий не нужны: состояние клавиш ведёт система.
 * Каждый ответ системы проверяется: молча отклонённый ввод - экран блокировки или UAC.
 */
export const createWindowsInput = (lib: () => WinNative, points: WinScreen): InputDriver => {
  const wheel = new WinWheel()
  let isSelfElevated: boolean | undefined

  const send = (input: WinInput) => {
    if (lib().sendInput(1, input, lib().inputSize) < 1) {
      throw new ComputerError('blocked', SECURE_DESKTOP)
    }
  }

  const isPressed = (vk: number) => (lib().asyncKeyState(vk) & KEY_DOWN_BIT) !== 0

  /**
   * Примет ли ввод окно в точке (null - в фокусе). Ввод обычной программы в приложение от имени
   * администратора Windows молча выбрасывает (UIPI) - спросить заранее. Не узнали - да: ложный
   * отказ хуже, чем пропавший клик, который модель увидит на снимке.
   */
  const canReach = (at: Point | null): boolean => {
    const native = lib()
    const window = at ? native.windowFromPoint(points.toPixels(at)) : native.foregroundWindow()

    if (!window) return true

    const pid = [0]

    native.windowProcessId(native.ancestor(window, GA_ROOT) ?? window, pid)

    const process = pid[0] ? native.openProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid[0]) : null

    if (!process) return true

    try {
      if (isElevated(native, process) !== true) return true

      isSelfElevated ??= isElevated(native, native.currentProcess()) ?? false

      return isSelfElevated
    } finally {
      native.closeHandle(process)
    }
  }

  return {
    cursor: () => {
      const at: Partial<Point> = {}

      if (!lib().getCursorPos(at)) throw new ComputerError('blocked', SECURE_DESKTOP)

      return points.toDip({ x: at.x ?? 0, y: at.y ?? 0 })
    },
    mouse: (motion, at, button) => {
      if (motion === 'move' || motion === 'drag') {
        const pixels = points.toPixels(at)

        if (!lib().setCursorPos(pixels.x, pixels.y)) {
          throw new ComputerError('blocked', SECURE_DESKTOP)
        }

        return
      }

      // Левше Windows переставляет кнопки и у SendInput: спросить на каждом нажатии - настройку
      // меняют на ходу.
      send(buttonInput(button, motion === 'down', lib().systemMetric(SM_SWAPBUTTON) !== 0))
    },
    key: (keyCode, isDown) => {
      send(keyInput(keyCode, lib().mapVirtualKey(keyCode, MAPVK_VK_TO_VSC), isDown))
    },
    text: (chunk, phase) => {
      for (const input of unicodeInputs(chunk, phase)) send(input)
    },
    // По знаку, с удержанием и паузой: быстрее занятый Блокнот Windows 11 путает знаки (ADR 0058).
    typing: { chunk: 1, holdMs: 30, gapMs: 30 },
    scroll: (down, right) => {
      for (const input of wheel.inputs(down, right)) send(input)
    },
    heldFlags: () => heldFlagsOf(isPressed),
    isButtonHeld: () => isPressed(VK_LBUTTON) || isPressed(VK_RBUTTON),
    canReach,
  }
}

let native: WinNative | null = null

/**
 * Мышь, клавиатура и буфер обмена этого Windows: вызовы грузятся на первом действии (на маке их
 * не зовёт никто), точки пересчитывает Electron - он знает масштаб каждого монитора.
 */
export const windowsInput: InputDriver = {
  ...createWindowsInput(() => (native ??= loadWinNative()), {
    toPixels: (at) => screen.dipToScreenPoint({ x: Math.round(at.x), y: Math.round(at.y) }),
    toDip: (at) => screen.screenToDipPoint(at),
  }),
  clipboard: createWindowsClipboard(LIVE_MOTION),
}

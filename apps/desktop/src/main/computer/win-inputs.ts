import { WINDOWS_MODIFIERS, WINDOWS_EXTENDED_KEYS } from './computer-keys-windows.constants'
import { WHEEL_NOTCH_PX } from './computer.constants'
import type { TextPhase, MouseButton } from './computer.types'
import {
  KEYEVENTF,
  INPUT_MOUSE,
  MOUSEEVENTF,
  WHEEL_DELTA,
  INPUT_KEYBOARD,
} from './win-input.constants'

/**
 * Событие для SendInput в виде, который koffi переводит в структуру INPUT (win-structs.ts):
 * объединение u несёт ровно одно поле - mi (мышь) или ki (клавиатура).
 */
export type WinInput =
  | {
      type: typeof INPUT_MOUSE
      u: {
        mi: {
          dx: number
          dy: number
          mouseData: number
          dwFlags: number
          time: number
          dwExtraInfo: number
        }
      }
    }
  | {
      type: typeof INPUT_KEYBOARD
      u: { ki: { wVk: number; wScan: number; dwFlags: number; time: number; dwExtraInfo: number } }
    }

const mouse = (dwFlags: number, mouseData = 0): WinInput => ({
  type: INPUT_MOUSE,
  u: { mi: { dx: 0, dy: 0, mouseData, dwFlags, time: 0, dwExtraInfo: 0 } },
})

const keyboard = (wVk: number, wScan: number, dwFlags: number): WinInput => ({
  type: INPUT_KEYBOARD,
  u: { ki: { wVk, wScan, dwFlags, time: 0, dwExtraInfo: 0 } },
})

const BUTTON_FLAGS: Record<MouseButton, { down: number; up: number }> = {
  left: { down: MOUSEEVENTF.leftDown, up: MOUSEEVENTF.leftUp },
  right: { down: MOUSEEVENTF.rightDown, up: MOUSEEVENTF.rightUp },
  middle: { down: MOUSEEVENTF.middleDown, up: MOUSEEVENTF.middleUp },
}

/**
 * Нажатие или отпускание кнопки там, где курсор: без MOUSEEVENTF_MOVE - курсор на месте, его
 * поставила рука. Двойной клик Windows узнаёт сама - по времени и месту второго нажатия. Флаги
 * SendInput - физические кнопки: у левши (isSwapped) Windows меняет их местами, и левый клик
 * модели стал бы правым - поэтому меняем заранее.
 */
export const buttonInput = (button: MouseButton, isDown: boolean, isSwapped = false): WinInput => {
  const physical =
    isSwapped && button !== 'middle' ? (button === 'left' ? 'right' : 'left') : button

  return mouse(isDown ? BUTTON_FLAGS[physical].down : BUTTON_FLAGS[physical].up)
}

/**
 * Клавиша по виртуальному коду с её скан-кодом. Стрелки, Home, End и прочий «расширенный» ряд -
 * с пометкой, иначе Windows приняла бы их за цифровой блок.
 */
export const keyInput = (vk: number, scan: number, isDown: boolean): WinInput =>
  keyboard(
    vk,
    scan,
    (isDown ? 0 : KEYEVENTF.keyUp) | (WINDOWS_EXTENDED_KEYS.has(vk) ? KEYEVENTF.extendedKey : 0),
  )

/**
 * Текст знаками Юникода, а не клавишами: не зависит от раскладки человека. tap - нажатие и
 * отпускание каждой половины UTF-16 (эмодзи - две) по порядку; down и up - только нажатия или
 * только отпускания: между ними рука держит знак (TypingProfile Windows).
 */
export const unicodeInputs = (chunk: string, phase: TextPhase = 'tap'): WinInput[] =>
  Array.from({ length: chunk.length }, (_, index) => chunk.charCodeAt(index)).flatMap((unit) => {
    const down = keyboard(0, unit, KEYEVENTF.unicode)
    const up = keyboard(0, unit, KEYEVENTF.unicode | KEYEVENTF.keyUp)

    return phase === 'tap' ? [down, up] : [phase === 'down' ? down : up]
  })

/**
 * Колесо из пикселей руки - целыми щелчками: щелчок WHEEL_NOTCH_PX - это WHEEL_DELTA единиц
 * Windows. Доли щелчка старые приложения (Win32, Java) делят на 120 без накопления и не крутят
 * вовсе, поэтому толчки руки копятся, а уходит целое число щелчков; остаток ждёт следующего
 * толчка в ту же сторону. Вниз страницы у Windows - отрицательное, вправо - положительное.
 */
export class WinWheel {
  private pending = { down: 0, right: 0 }

  inputs(down: number, right: number): WinInput[] {
    const inputs: WinInput[] = []
    const vertical = this.take('down', -down)
    const horizontal = this.take('right', right)

    if (vertical) inputs.push(mouse(MOUSEEVENTF.wheel, vertical))
    if (horizontal) inputs.push(mouse(MOUSEEVENTF.hwheel, horizontal))

    return inputs
  }

  /** Добавить толчок к накопленному; отдать целые щелчки в единицах, остаток - оставить. */
  private take(axis: 'down' | 'right', pixels: number): number {
    const units = (pixels * WHEEL_DELTA) / WHEEL_NOTCH_PX
    // Смена направления обнуляет остаток: доля прошлой прокрутки не должна гасить новую.
    const before = Math.sign(this.pending[axis]) === -Math.sign(units) ? 0 : this.pending[axis]
    const total = before + units
    const whole = Math.trunc(Math.round(total) / WHEEL_DELTA) * WHEEL_DELTA

    this.pending[axis] = total - whole

    return whole
  }
}

/** Флаги зажатых модификаторов по опросу клавиш: ненулевые - человек держит хоть один. */
export const heldFlagsOf = (isDown: (vk: number) => boolean): number =>
  Object.values(WINDOWS_MODIFIERS).reduce(
    (flags, modifier) => (isDown(modifier.code) ? flags | modifier.flag : flags),
    0,
  )

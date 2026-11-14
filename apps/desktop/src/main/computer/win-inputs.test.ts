import { it, expect, describe } from 'vitest'

import { wheelTicks } from '../browser/human-motion'
import { FLAG } from './cg-events.constants'
import { WHEEL_NOTCH_PX } from './computer.constants'
import { KEYEVENTF, INPUT_MOUSE, MOUSEEVENTF, INPUT_KEYBOARD } from './win-input.constants'
import { keyInput, WinWheel, buttonInput, heldFlagsOf, unicodeInputs } from './win-inputs'
import { winStructs } from './win-structs'

describe('Windows input events', () => {
  // Раскладка INPUT у Windows x64: 40 байт, объединение со смещения 8; у мыши и клавиатуры
  // dwExtraInfo (указатель) выровнен на 8. Ошибка здесь - SendInput молча не сделал бы ничего.
  it('lays INPUT out the way 64-bit Windows reads it', () => {
    const { koffi, INPUT, POINT } = winStructs()

    expect(koffi.sizeof(INPUT)).toBe(40)
    expect(koffi.offsetof(INPUT, 'u')).toBe(8)
    expect(koffi.sizeof(POINT)).toBe(8)
  })

  it('presses buttons where the pointer already is, without moving it', () => {
    expect(buttonInput('left', true)).toEqual({
      type: INPUT_MOUSE,
      u: {
        mi: { dx: 0, dy: 0, mouseData: 0, dwFlags: MOUSEEVENTF.leftDown, time: 0, dwExtraInfo: 0 },
      },
    })
    expect(buttonInput('right', false).u).toMatchObject({ mi: { dwFlags: MOUSEEVENTF.rightUp } })
  })

  it('marks arrows and other extended keys, and releases with key-up', () => {
    expect(keyInput(0x41, 30, true)).toEqual({
      type: INPUT_KEYBOARD,
      u: { ki: { wVk: 0x41, wScan: 30, dwFlags: 0, time: 0, dwExtraInfo: 0 } },
    })
    expect(keyInput(0x25, 75, false).u).toMatchObject({
      ki: { dwFlags: KEYEVENTF.keyUp | KEYEVENTF.extendedKey },
    })
  })

  it('splits a held character into its presses and its releases', () => {
    expect(
      unicodeInputs('😀', 'down').map((input) => ('ki' in input.u ? input.u.ki.dwFlags : 0)),
    ).toEqual([KEYEVENTF.unicode, KEYEVENTF.unicode])
    expect(unicodeInputs('a', 'up')[0]?.u).toMatchObject({
      ki: { wScan: 0x61, dwFlags: KEYEVENTF.unicode | KEYEVENTF.keyUp },
    })
  })

  it('types text as Unicode, both halves of an emoji in order', () => {
    const inputs = unicodeInputs('a😀')

    expect(inputs).toHaveLength(6)
    expect(inputs.map((input) => ('ki' in input.u ? input.u.ki.wScan : -1))).toEqual([
      0x61, 0x61, 0xd83d, 0xd83d, 0xde00, 0xde00,
    ])
    const released = inputs[1]

    expect(released && 'ki' in released.u ? released.u.ki.dwFlags : null).toBe(
      KEYEVENTF.unicode | KEYEVENTF.keyUp,
    )
  })

  it('swaps the buttons for a left-handed mouse, so a left click stays a left click', () => {
    expect(buttonInput('left', true, true).u).toMatchObject({
      mi: { dwFlags: MOUSEEVENTF.rightDown },
    })
    expect(buttonInput('right', false, true).u).toMatchObject({
      mi: { dwFlags: MOUSEEVENTF.leftUp },
    })
    expect(buttonInput('middle', true, true).u).toMatchObject({
      mi: { dwFlags: MOUSEEVENTF.middleDown },
    })
  })

  // Старые приложения делят колесо на 120 без накопления: каждый толчок - целые щелчки, а
  // сумма - ровно столько щелчков, сколько просила модель.
  it('scrolls in whole notches only, and the notches add up to what was asked', () => {
    for (let notches = 1; notches <= 30; notches += 1) {
      const wheel = new WinWheel()
      const sent = wheelTicks(0, notches * WHEEL_NOTCH_PX).flatMap((tick) =>
        wheel.inputs(tick.dy, tick.dx),
      )
      const units = sent.map((input) => ('mi' in input.u ? input.u.mi.mouseData : 0))

      expect(units.every((value) => value % 120 === 0)).toBe(true)
      expect(units.reduce((sum, value) => sum + value, 0)).toBe(-notches * 120)
    }
  })

  it('scrolls right as positive and forgets a part notch when the direction turns', () => {
    const wheel = new WinWheel()

    expect(wheel.inputs(0, 80)[0]?.u).toMatchObject({
      mi: { dwFlags: MOUSEEVENTF.hwheel, mouseData: 120 },
    })
    expect(wheel.inputs(40, 0)).toEqual([])
    expect(wheel.inputs(-80, 0)[0]?.u).toMatchObject({ mi: { mouseData: 120 } })
  })

  it('reports held modifiers as flags', () => {
    expect(heldFlagsOf((vk) => vk === 0x11)).toBe(FLAG.control)
    expect(heldFlagsOf(() => false)).toBe(0)
  })
})

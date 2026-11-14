import { it, expect, describe } from 'vitest'

import { createWindowsInput } from './win-input'
import { MOUSEEVENTF } from './win-input.constants'
import type { WinInput } from './win-inputs'
import type { WinNative } from './win-native'

const SAME = {
  toPixels: (at: { x: number; y: number }) => at,
  toDip: (at: { x: number; y: number }) => at,
}

/** Подставные вызовы Windows: всё удаётся, кроме того, что тест поменял. */
const fakeNative = (changes: Partial<WinNative> = {}) => {
  const sent: WinInput[] = []
  const native: WinNative = {
    sendInput: (_count, input) => {
      sent.push(input)

      return 1
    },
    setCursorPos: () => 1,
    getCursorPos: (point) => {
      point.x = 100
      point.y = 200

      return 1
    },
    asyncKeyState: () => 0,
    mapVirtualKey: () => 0,
    windowFromPoint: () => 'window',
    foregroundWindow: () => 'window',
    ancestor: (window) => window,
    windowProcessId: (_window, pid) => {
      pid[0] = 42

      return 1
    },
    openProcess: () => 'process',
    closeHandle: () => 1,
    currentProcess: () => 'self',
    openProcessToken: (_process, _access, token) => {
      token[0] = 'token'

      return 1
    },
    tokenInformation: () => 1,
    systemMetric: () => 0,
    inputSize: 40,
    ...changes,
  }

  return { native, sent }
}

describe('Windows input driver', () => {
  it('reads the pointer in Electron points', () => {
    const { native } = fakeNative()

    expect(createWindowsInput(() => native, SAME).cursor()).toEqual({ x: 100, y: 200 })
  })

  // Экран блокировки и запрос администратора: Windows отказывает в курсоре и вводе. Рука должна
  // узнать это, а не отчитаться, что напечатала.
  it('says the screen is locked instead of pretending the input went through', () => {
    const noCursor = fakeNative({ getCursorPos: () => 0 })
    const noInput = fakeNative({ sendInput: () => 0 })
    const noMove = fakeNative({ setCursorPos: () => 0 })

    expect(() => createWindowsInput(() => noCursor.native, SAME).cursor()).toThrow(/lock screen/)
    expect(() => createWindowsInput(() => noInput.native, SAME).text('a', 'tap')).toThrow(
      /lock screen/,
    )
    expect(() =>
      createWindowsInput(() => noMove.native, SAME).mouse('move', { x: 1, y: 1 }, 'left', 1, 0),
    ).toThrow(/lock screen/)
  })

  it('presses the right physical button for a left-handed mouse', () => {
    const { native, sent } = fakeNative({ systemMetric: () => 1 })

    createWindowsInput(() => native, SAME).mouse('down', { x: 1, y: 1 }, 'left', 1, 0)

    expect(sent[0]?.u).toMatchObject({ mi: { dwFlags: MOUSEEVENTF.rightDown } })
  })

  it('refuses a window of an app running as administrator, unless the IDE runs as one too', () => {
    const elevatedTarget = (self: boolean) =>
      fakeNative({
        tokenInformation: (token, _kind, info) => {
          info[0] = token === 'token-self' ? Number(self) : 1

          return 1
        },
        openProcessToken: (process, _access, token) => {
          token[0] = process === 'self' ? 'token-self' : 'token'

          return 1
        },
      })

    expect(createWindowsInput(() => elevatedTarget(false).native, SAME).canReach?.(null)).toBe(
      false,
    )
    expect(createWindowsInput(() => elevatedTarget(true).native, SAME).canReach?.(null)).toBe(true)
  })

  it('lets the hand act when it cannot tell, rather than refuse for nothing', () => {
    const noToken = fakeNative({ openProcessToken: () => 0 })
    const noWindow = fakeNative({ foregroundWindow: () => null })

    expect(createWindowsInput(() => noToken.native, SAME).canReach?.(null)).toBe(true)
    expect(createWindowsInput(() => noWindow.native, SAME).canReach?.(null)).toBe(true)
  })
})

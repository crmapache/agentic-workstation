import { it, expect, describe } from 'vitest'

import { FLAG } from './cg-events.constants'
import { parseChord, KeyNameError, WINDOWS_KEYMAP } from './computer-keys'

describe('key combinations', () => {
  it('reads mac and xdotool names the same way', () => {
    expect(parseChord('cmd+shift+t')).toEqual(parseChord('super+Shift_L+T'))
    expect(parseChord('Return').key).toBe(36)
    expect(parseChord('enter').key).toBe(36)
    expect(parseChord('ctrl+Page_Down')).toEqual({
      modifiers: [{ code: 59, flag: FLAG.control }],
      key: 121,
    })
  })

  it('keeps the modifiers in the order they are pressed in', () => {
    const chord = parseChord('cmd+option+i')

    expect(chord.modifiers).toEqual([
      { code: 55, flag: FLAG.command },
      { code: 58, flag: FLAG.option },
    ])
    expect(chord.key).toBe(34)
  })

  it('takes a modifier alone and keys that look like separators', () => {
    expect(parseChord('shift')).toEqual({ modifiers: [{ code: 56, flag: FLAG.shift }], key: null })
    expect(parseChord('cmd+-').key).toBe(27)
    expect(parseChord('cmd++').key).toBe(24)
    expect(parseChord('+').key).toBe(24)
  })

  it('refuses unknown names and two keys at once', () => {
    expect(() => parseChord('cmd+banana')).toThrow(KeyNameError)
    expect(() => parseChord('a+b')).toThrow(KeyNameError)
    expect(() => parseChord(' ')).toThrow(KeyNameError)
  })

  it('on Windows takes cmd for Ctrl and super for the Windows key, with Windows codes', () => {
    expect(parseChord('cmd+c', WINDOWS_KEYMAP)).toEqual({
      modifiers: [{ code: 0x11, flag: FLAG.control }],
      key: 0x43,
    })
    expect(parseChord('ctrl+shift+Escape', WINDOWS_KEYMAP).key).toBe(0x1b)
    expect(parseChord('super+e', WINDOWS_KEYMAP).modifiers[0]?.code).toBe(0x5b)
    expect(parseChord('alt+F4', WINDOWS_KEYMAP)).toEqual({
      modifiers: [{ code: 0x12, flag: FLAG.option }],
      key: 0x73,
    })
    expect(parseChord('Page_Down', WINDOWS_KEYMAP).key).toBe(0x22)
    expect(() => parseChord('fn+f1', WINDOWS_KEYMAP)).toThrow(KeyNameError)
  })
})

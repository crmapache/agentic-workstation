import { it, expect, describe } from 'vitest'

import { keyEvents, charEvents, KeyComboError } from './page-keys'

describe('клавиши для CDP', () => {
  it('Enter печатает перевод строки', () => {
    expect(keyEvents('Enter')).toEqual([
      {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        modifiers: 0,
        text: '\r',
      },
      { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 0 },
    ])
  })

  it('сочетание: модификаторы вокруг клавиши, без текста', () => {
    const events = keyEvents('Control+Shift+K')

    expect(events.map((event) => `${event.type}:${event.key}`)).toEqual([
      'rawKeyDown:Control',
      'rawKeyDown:Shift',
      'rawKeyDown:K',
      'keyUp:K',
      'keyUp:Shift',
      'keyUp:Control',
    ])
    expect(events.every((event) => event.modifiers === 10)).toBe(true)
    expect(events[2]?.text).toBeUndefined()
  })

  it('Shift+буква печатает заглавную', () => {
    expect(keyEvents('Shift+a')[1]).toMatchObject({ type: 'keyDown', key: 'A', text: 'A' })
  })

  it('Meta+A на Mac - команда «выделить всё»; псевдонимы модификаторов', () => {
    expect(keyEvents('Cmd+a')[1]).toMatchObject({ key: 'a', commands: ['selectAll'], modifiers: 4 })
    expect(keyEvents('ControlOrMeta+A')[1]).toMatchObject({ commands: ['selectAll'] })
  })

  it('стрелки, F-клавиши и знак плюс', () => {
    expect(keyEvents('ArrowDown')[0]).toMatchObject({
      type: 'rawKeyDown',
      windowsVirtualKeyCode: 40,
    })
    expect(keyEvents('F5')[0]).toMatchObject({ key: 'F5', windowsVirtualKeyCode: 116 })
    expect(keyEvents('Shift++')[1]).toMatchObject({ key: '+', text: '+' })
  })

  it('неизвестное - понятная ошибка', () => {
    expect(() => keyEvents('Hyper+a')).toThrow(KeyComboError)
    expect(() => keyEvents('Banana')).toThrow('Unknown key "Banana"')
  })

  it('знак текста по клавише', () => {
    expect(charEvents('Z')[0]).toMatchObject({ type: 'keyDown', key: 'Z', text: 'Z', code: 'KeyZ' })
    expect(charEvents('ё')[0]).toMatchObject({ key: 'ё', text: 'ё', windowsVirtualKeyCode: 0 })
  })
})

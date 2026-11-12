import { it, vi, expect, describe, afterEach } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('./platform')
})

const onWindows = async () => {
  vi.doMock('./platform', () => ({ IS_MAC: false, PLATFORM: 'win32' }))

  return import('./keys')
}

describe('клавиши на маке', () => {
  it('подписи и нажатия - как записаны', async () => {
    const { shortcutKeys, shortcutLabel, withMacKeys } = await import('./keys')
    const stroke = { metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }

    expect(shortcutKeys(['⇧', '⌘', 'T'])).toEqual(['⇧', '⌘', 'T'])
    expect(shortcutLabel('⇧⌘T')).toBe('⇧⌘T')
    expect(withMacKeys(stroke)).toBe(stroke)
  })
})

describe('клавиши на Windows (ADR 0048)', () => {
  it('⌘ - это Ctrl, порядок модификаторов - как в Windows', async () => {
    const { shortcutKeys, shortcutLabel } = await onWindows()

    expect(shortcutKeys(['⇧', '⌘', 'T'])).toEqual(['Ctrl', 'Shift', 'T'])
    expect(shortcutLabel('⌘,')).toBe('Ctrl+,')
    expect(shortcutLabel('⌥F12')).toBe('Alt+F12')
    expect(shortcutLabel('⌘⌫')).toBe('Ctrl+Backspace')
    expect(shortcutLabel('⌘Enter')).toBe('Ctrl+Enter')
  })

  it('⌥⌘ - один Alt: Ctrl+Alt там набирает буквы', async () => {
    const { shortcutLabel, isAltCommand } = await onWindows()

    expect(shortcutLabel('⌥⌘C')).toBe('Alt+C')
    expect(isAltCommand({ altKey: true, ctrlKey: false, metaKey: false, shiftKey: false })).toBe(
      true,
    )
    expect(isAltCommand({ altKey: true, ctrlKey: true, metaKey: false, shiftKey: false })).toBe(
      false,
    )
  })

  it('Ctrl в нажатии - это ⌘ для проверок клавиш, код и клавиша остаются', async () => {
    const { withMacKeys } = await onWindows()
    const stroke = withMacKeys({
      key: 't',
      code: 'KeyT',
      repeat: false,
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      shiftKey: true,
    })

    expect(stroke).toEqual({
      key: 't',
      code: 'KeyT',
      repeat: false,
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
    })
  })
})

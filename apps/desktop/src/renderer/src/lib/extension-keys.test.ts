import { it, expect, describe } from 'vitest'

import { extensionKeyLabel, extensionKeyGlyphs, matchesExtensionKeys } from './extension-keys'

const press = (
  code: string,
  mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})

describe('клавиши команд расширений', () => {
  it('подпись - знаками мака в порядке Apple', () => {
    expect(extensionKeyGlyphs('cmd+shift+k')).toEqual(['⇧', '⌘', 'K'])
    expect(extensionKeyLabel('alt+ctrl+f5')).toBe('⌃⌥F5')
    expect(extensionKeyLabel('cmd+enter')).toBe('⌘↩')
  })

  it('нажатие совпадает только целиком, по коду клавиши, а не по букве раскладки', () => {
    expect(
      matchesExtensionKeys('cmd+shift+k', press('KeyK', { metaKey: true, shiftKey: true })),
    ).toBe(true)
    expect(matchesExtensionKeys('cmd+shift+k', press('KeyK', { metaKey: true }))).toBe(false)
    expect(matchesExtensionKeys('cmd+k', press('KeyK', { metaKey: true, altKey: true }))).toBe(
      false,
    )
    expect(matchesExtensionKeys('alt+[', press('BracketLeft', { altKey: true }))).toBe(true)
    expect(matchesExtensionKeys('cmd+1', press('Digit1', { metaKey: true }))).toBe(true)
  })
})

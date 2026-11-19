import { it, expect, describe } from 'vitest'

import { keyLine, panelKeyOf, isOpenPanelKey, reachesPastMenu } from './panel-keys.utils'

const stroke = (code: string, mods: { shift?: boolean; alt?: boolean; ctrl?: boolean } = {}) => ({
  code,
  metaKey: true,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
  ctrlKey: mods.ctrl ?? false,
})

describe('клавиши панели', () => {
  it('⌘T - новая, ⇧⌘T - вернуть закрытую, ⇧⌘] и ⇧⌘[ - соседние', () => {
    expect(panelKeyOf(stroke('KeyT'))).toBe('newTab')
    expect(panelKeyOf(stroke('KeyT', { shift: true }))).toBe('reopenTab')
    expect(panelKeyOf(stroke('BracketRight', { shift: true }))).toBe('nextTab')
    expect(panelKeyOf(stroke('BracketLeft', { shift: true }))).toBe('previousTab')
  })

  it('с ⌥, ⌃, без ⌘ или без ⇧ у скобок - не клавиша панели', () => {
    expect(panelKeyOf(stroke('KeyT', { alt: true }))).toBeNull()
    expect(panelKeyOf({ ...stroke('KeyT'), metaKey: false })).toBeNull()
    expect(panelKeyOf(stroke('BracketRight'))).toBeNull()
    expect(panelKeyOf(stroke('KeyW'))).toBeNull()
  })

  it('сквозь меню - только возврат закрытой на экране истории', () => {
    expect(reachesPastMenu('reopenTab', 'history', 2)).toBe(true)
    expect(reachesPastMenu('reopenTab', 'history', 0)).toBe(false)
    expect(reachesPastMenu('newTab', 'history', 2)).toBe(false)
    expect(reachesPastMenu('reopenTab', 'settings', 2)).toBe(false)
  })

  it('клавиша строкой для подсказки', () => {
    expect(keyLine('reopenTab')).toBe('⇧⌘T')
  })

  it('«открыть панель» - ровно ⌘Esc: голый Esc останавливает ход, автоповтор не в счёт', () => {
    const esc = {
      key: 'Escape',
      code: 'Escape',
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    }

    expect(isOpenPanelKey({ ...esc, repeat: false })).toBe(true)
    expect(isOpenPanelKey({ ...esc, repeat: true })).toBe(false)
    expect(isOpenPanelKey({ ...esc, metaKey: false, repeat: false })).toBe(false)
    expect(isOpenPanelKey({ ...esc, shiftKey: true, repeat: false })).toBe(false)
    expect(isOpenPanelKey({ ...esc, key: 'Enter', repeat: false })).toBe(false)
  })
})

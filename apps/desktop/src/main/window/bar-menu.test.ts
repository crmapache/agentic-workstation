import type { MenuItem, MenuItemConstructorOptions } from 'electron'
import { it, vi, expect, describe } from 'vitest'

import type { BarMenuEntry } from '@shared/window'

import { barMenuItems } from './bar-menu'

const BARS: BarMenuEntry[] = [
  {
    bar: 'side',
    groups: [
      [
        { id: 'changes', label: 'Changes', shown: true },
        { id: 'files', label: 'Files', shown: false },
      ],
      [{ id: 'settings', label: 'Settings', shown: true }],
    ],
  },
]

/** Нажать пункт, как Electron: галочку он переключает до click. */
const press = (item: MenuItemConstructorOptions) => {
  const checked = item.type === 'checkbox' ? !item.checked : false

  item.click?.({ checked } as MenuItem, undefined, {})
}

describe('меню View: кнопки полос', () => {
  it('у полосы - кнопки галочками по группам с чертой между ними и возврат как было', () => {
    const [left] = barMenuItems(BARS, vi.fn())
    const submenu = left?.submenu as MenuItemConstructorOptions[]

    expect(left?.label).toBe('Left Bar')
    expect(submenu.map((item) => item.label ?? item.type)).toEqual([
      'Changes',
      'Files',
      'separator',
      'Settings',
      'separator',
      'Reset to Default',
    ])
    expect(submenu.slice(0, 2).map((item) => item.checked)).toEqual([true, false])
  })

  it('галочка шлёт окну, какой кнопка стала, «вернуть» - всю полосу', () => {
    const send = vi.fn()
    const submenu = barMenuItems(BARS, send)[0]?.submenu as MenuItemConstructorOptions[]

    press(submenu[1] as MenuItemConstructorOptions)
    press(submenu[0] as MenuItemConstructorOptions)
    press(submenu.at(-1) as MenuItemConstructorOptions)

    expect(send.mock.calls).toEqual([
      [{ kind: 'setShown', bar: 'side', id: 'files', shown: true }],
      [{ kind: 'setShown', bar: 'side', id: 'changes', shown: false }],
      [{ kind: 'reset', bar: 'side' }],
    ])
  })
})

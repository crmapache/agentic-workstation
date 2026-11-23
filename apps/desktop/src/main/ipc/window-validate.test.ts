import { it, expect, describe } from 'vitest'

import type { BarMenuEntry } from '@shared/window'

import { assertBarMenu } from './window-validate'

describe('кнопки полос из окна', () => {
  it('берётся только то, что той формы', () => {
    const bars: BarMenuEntry[] = [
      { bar: 'provider', groups: [[{ id: 'terminal', label: 'Terminal', shown: false }]] },
    ]

    expect(assertBarMenu(bars)).toEqual(bars)
    expect(() => assertBarMenu({ bar: 'side' })).toThrow()
    expect(() => assertBarMenu([{ bar: 'left', groups: [] }])).toThrow()
    expect(() =>
      assertBarMenu([{ bar: 'side', groups: [[{ id: 'files', label: 'Files' }]] }]),
    ).toThrow()
    expect(() => assertBarMenu([{ bar: 'side', groups: ['files'] }])).toThrow()
  })
})

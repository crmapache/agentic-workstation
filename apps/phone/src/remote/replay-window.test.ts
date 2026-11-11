import { it, expect, describe } from 'vitest'

import { ReplayWindow, REPLAY_WINDOW } from './replay-window'

describe('окно повторов', () => {
  it('новый номер проходит, повтор - нет, опоздавший в окне - один раз', () => {
    const window = new ReplayWindow()

    expect([1n, 2n, 4n].map((counter) => window.accept(counter))).toEqual([true, true, true])
    expect(window.accept(2n)).toBe(false)
    expect(window.accept(3n)).toBe(true)
    expect(window.accept(3n)).toBe(false)
  })

  it('старше окна - отказ: повтор не отличить от позднего', () => {
    const window = new ReplayWindow()

    window.accept(1n)
    window.accept(1n + REPLAY_WINDOW + 5n)

    expect(window.accept(2n)).toBe(false)
    expect(window.accept(-1n)).toBe(false)
  })
})

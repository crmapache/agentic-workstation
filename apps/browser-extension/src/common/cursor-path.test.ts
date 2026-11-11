import { it, expect, describe } from 'vitest'

import { cursorPathOf, cursorDurationOf } from './cursor-path'

describe('путь курсора из сообщения IDE', () => {
  it('точки по порядку времени проходят как есть', () => {
    const path: [number, number, number][] = [
      [10, 10, 0],
      [40, 30, 16],
      [80, 60, 32],
    ]

    expect(cursorPathOf(path)).toEqual(path)
    expect(cursorDurationOf(32)).toBe(32)
  })

  it('кривой путь - нет пути: курсор едет по прямой', () => {
    expect(cursorPathOf([[1, 2, 0]])).toBeUndefined()
    expect(
      cursorPathOf([
        [1, 2, 10],
        [3, 4, 5],
      ]),
    ).toBeUndefined()
    expect(
      cursorPathOf([
        [1, 2, 0],
        [3, 'x', 5],
      ]),
    ).toBeUndefined()
    expect(cursorPathOf('path')).toBeUndefined()
    expect(cursorDurationOf(-1)).toBeUndefined()
    expect(cursorDurationOf(60_000)).toBeUndefined()
  })
})

import { it, expect, describe } from 'vitest'

import {
  pathId,
  mapLimit,
  numberArg,
  stringArg,
  ArgumentError,
  stringListArg,
} from './native-tools'

describe('mapLimit', () => {
  it('не больше limit разом, порядок как у входа', async () => {
    let running = 0
    let peak = 0
    const result = await mapLimit([5, 1, 4, 2, 3], 2, async (value) => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, value))
      running -= 1

      return value * 10
    })

    expect(result).toEqual([50, 10, 40, 20, 30])
    expect(peak).toBe(2)
  })
})

describe('аргументы', () => {
  it('строка, список и число с пределами', () => {
    expect(stringArg({ a: 'x' }, 'a', true)).toBe('x')
    expect(() => stringArg({}, 'a', true)).toThrow(ArgumentError)
    expect(stringListArg({ a: 'one' }, 'a')).toEqual(['one'])
    expect(numberArg({ a: 500 }, 'a', { min: 1, max: 50, fallback: 10 })).toBe(50)
  })
})

describe('pathId', () => {
  it('экранирует id и не пускает «.» и «..»', () => {
    expect(pathId('a/b', 'id')).toBe('a%2Fb')
    expect(() => pathId('..', 'event_id')).toThrow(ArgumentError)
    expect(() => pathId('.', 'event_id')).toThrow(ArgumentError)
  })
})

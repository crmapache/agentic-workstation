import { it, expect, describe } from 'vitest'

import { byRank, rankBefore, rankBetween } from './tracker-rank'

describe('rankBetween', () => {
  it('всегда строго между соседями', () => {
    const cases: [string | null, string | null][] = [
      [null, null],
      [null, 'i'],
      ['i', null],
      ['a', 'b'],
      ['a', 'a1'],
      ['az', 'b'],
      ['zz', null],
      [null, '01'],
      ['0001', '0002'],
    ]

    for (const [after, before] of cases) {
      const rank = rankBetween(after, before)

      if (after !== null) expect(rank > after).toBe(true)
      if (before !== null) expect(rank < before).toBe(true)
      expect(rank.endsWith('0')).toBe(false)
    }
  })

  it('сотня вставок в одно место держит порядок и не раздувает строку', () => {
    const list: string[] = [rankBetween(null, null)]

    list.push(rankBetween(list[0] ?? null, null))

    for (let index = 0; index < 100; index += 1) {
      list.splice(1, 0, rankBetween(list[0] ?? null, list[1] ?? null))
    }

    expect([...list].sort()).toEqual(list)
    expect(Math.max(...list.map((rank) => rank.length))).toBeLessThan(30)
  })

  it('вставки в начало и в конец', () => {
    let first = rankBetween(null, null)
    let last = first

    for (let index = 0; index < 50; index += 1) {
      const head = rankBetween(null, first)
      const tail = rankBetween(last, null)

      expect(head < first && tail > last).toBe(true)
      first = head
      last = tail
    }
  })
})

describe('rankBefore', () => {
  const list = [
    { id: 'a', rank: 'b' },
    { id: 'b', rank: 'd' },
  ]

  it('перед найденным и в конец', () => {
    expect(rankBefore(list, 'a') < 'b').toBe(true)
    expect(rankBefore(list, 'b') > 'b' && rankBefore(list, 'b') < 'd').toBe(true)
    expect(rankBefore(list, null) > 'd').toBe(true)
    expect(rankBefore(list, 'missing') > 'd').toBe(true)
    expect(rankBefore([], null)).toBeTruthy()
  })

  it('равное место решает id', () => {
    const items = [
      { id: 'y', rank: 'm' },
      { id: 'x', rank: 'm' },
    ]

    expect(items.sort(byRank).map((item) => item.id)).toEqual(['x', 'y'])
  })
})

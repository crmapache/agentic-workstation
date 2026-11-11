import { it, expect, describe } from 'vitest'

import {
  shareOf,
  formatCost,
  formatBytes,
  formatCount,
  formatPercent,
  formatDuration,
  formatDeltaPercent,
} from './statistics-format.utils'

describe('formatCount', () => {
  it('до тысячи - как есть, дальше - k, M, B', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(950)).toBe('950')
    expect(formatCount(1000)).toBe('1k')
    expect(formatCount(12_400)).toBe('12.4k')
    expect(formatCount(124_400)).toBe('124k')
    expect(formatCount(3_140_000)).toBe('3.1M')
    expect(formatCount(2_500_000_000)).toBe('2.5B')
  })

  it('округление не перескакивает единицу', () => {
    expect(formatCount(999_950)).toBe('1M')
    expect(formatCount(999.6)).toBe('1k')
  })

  it('отрицательное и дробное - не ломают счёт', () => {
    expect(formatCount(-5)).toBe('0')
    expect(formatCount(2.4)).toBe('2')
  })
})

describe('formatDuration', () => {
  it('минуты и часы', () => {
    expect(formatDuration(45 * 60_000)).toBe('45m')
    expect(formatDuration(200 * 60_000)).toBe('3h 20m')
    expect(formatDuration(180 * 60_000)).toBe('3h')
  })

  it('сотни часов - без минут', () => {
    expect(formatDuration((312 * 60 + 7) * 60_000)).toBe('312h')
  })

  it('меньше минуты - «<1m», ноль - «0m»', () => {
    expect(formatDuration(20_000)).toBe('<1m')
    expect(formatDuration(0)).toBe('0m')
  })
})

describe('formatCost', () => {
  it('центы, целые доллары, коротко', () => {
    expect(formatCost(0)).toBe('$0')
    expect(formatCost(0.004)).toBe('<$0.01')
    expect(formatCost(0.42)).toBe('$0.42')
    expect(formatCost(12.346)).toBe('$12.35')
    expect(formatCost(1234.4)).toBe('$1,234')
    expect(formatCost(12_400)).toBe('$12.4k')
  })
})

describe('formatPercent', () => {
  it('крохотная и почти вся доля не врут нулём и сотней', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(0.004)).toBe('<1%')
    expect(formatPercent(0.92)).toBe('92%')
    expect(formatPercent(0.996)).toBe('>99%')
    expect(formatPercent(1)).toBe('100%')
  })
})

describe('formatBytes', () => {
  it('KB, MB, GB', () => {
    expect(formatBytes(512_000)).toBe('512 KB')
    expect(formatBytes(340_000_000)).toBe('340 MB')
    expect(formatBytes(7_710_000_000)).toBe('7.7 GB')
  })
})

describe('formatDeltaPercent и shareOf', () => {
  it('процент со знаком', () => {
    expect(formatDeltaPercent({ direction: 'up', percent: 12.4 })).toBe('+12%')
    expect(formatDeltaPercent({ direction: 'down', percent: -8 })).toBe('-8%')
  })

  it('доля от нуля - ноль', () => {
    expect(shareOf(3, 0)).toBe(0)
    expect(shareOf(1, 4)).toBe(0.25)
  })
})

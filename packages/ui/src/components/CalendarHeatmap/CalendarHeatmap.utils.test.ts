import { it, expect, describe } from 'vitest'

import { monthRow, heatLevels } from './CalendarHeatmap.utils'

describe('heatLevels', () => {
  it('пустой день - ноль, остальные - четвертями среди непустых', () => {
    expect(heatLevels([0, 1, 2, 3, 4, 5, 6, 7, 8])).toEqual([0, 1, 1, 1, 2, 2, 3, 3, 4])
  })

  it('один огромный день не делает остальные бледными', () => {
    const levels = heatLevels([10, 20, 30, 40, 5000])

    expect(levels.at(-1)).toBe(4)
    expect(levels.slice(0, 4)).toEqual([1, 1, 2, 3])
  })

  it('все непустые одинаковы - полный тон, а не самая бледная ступень', () => {
    expect(heatLevels([0, 7, 7, 7])).toEqual([0, 4, 4, 4])
  })

  it('пустой год - одни нули', () => {
    expect(heatLevels([0, 0, 0])).toEqual([0, 0, 0])
    expect(heatLevels([])).toEqual([])
  })
})

describe('monthRow', () => {
  const day = (key: string, monthLabel?: string) => ({
    key,
    value: 0,
    label: key,
    valueLabel: '',
    monthLabel,
  })

  it('подпись месяца - над неделей, где лежит его первое число', () => {
    const days = [
      ...Array.from({ length: 7 }, (_, index) => day(`a${index}`)),
      day('b0'),
      day('b1'),
      day('b2', 'Dec'),
      day('b3'),
    ]

    expect(monthRow(days)).toEqual(['', 'Dec'])
  })
})

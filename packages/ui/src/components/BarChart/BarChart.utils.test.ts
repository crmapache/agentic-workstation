import { it, expect, describe } from 'vitest'

import { niceTop, shareOf, maximaOf, tallestOf, axisAlignOf } from './BarChart.utils'

const point = (key: string, ...values: number[]) => ({ key, label: key, values })

describe('niceTop', () => {
  it('круглое число не ниже самого высокого столбца', () => {
    expect(niceTop(7, false)).toBe(8)
    expect(niceTop(8, false)).toBe(8)
    expect(niceTop(1240, false)).toBe(2000)
    expect(niceTop(3_100_000, false)).toBe(4_000_000)
    expect(niceTop(0.27, false)).toBe(0.3)
  })

  it('у целых величин половина шкалы тоже целая', () => {
    expect(niceTop(1, true)).toBe(2)
    expect(niceTop(3, true)).toBe(4)
    expect(niceTop(5, true)).toBe(6)
    expect(niceTop(9, true)).toBe(10)
    expect(niceTop(45, true)).toBe(50)
  })

  it('пустой график - единица, а не ноль: доли не делятся на ноль', () => {
    expect(niceTop(0, false)).toBe(1)
    expect(niceTop(Number.NaN, true)).toBe(1)
  })
})

describe('shareOf', () => {
  it('доля шкалы с краями 0 и 1', () => {
    expect(shareOf(5, 10)).toBe(0.5)
    expect(shareOf(12, 10)).toBe(1)
    expect(shareOf(-1, 10)).toBe(0)
    expect(shareOf(3, 0)).toBe(0)
  })
})

describe('maximaOf и tallestOf', () => {
  const points = [point('a', 2, 30), point('b', 9, 4), point('c', 9, 0)]

  it('grouped - рекорд у каждого ряда, число - над самым высоким столбцом графика', () => {
    expect(maximaOf(points, 2, 'grouped')).toEqual([9, 30])
    expect(tallestOf(points, 'grouped')).toEqual({ point: 0, series: 1 })
  })

  it('stacked - одна самая высокая стопка', () => {
    expect(maximaOf(points, 2, 'stacked')).toEqual([32])
    expect(tallestOf(points, 'stacked')).toEqual({ point: 0, series: 0 })
  })

  it('из равных - первый; нули рекордом не бывают', () => {
    expect(tallestOf([point('a', 3), point('b', 3)], 'grouped')).toEqual({ point: 0, series: 0 })
    expect(tallestOf([point('a', 0), point('b', 0)], 'grouped')).toBeNull()
    expect(maximaOf([], 2, 'grouped')).toEqual([0, 0])
  })
})

describe('axisAlignOf', () => {
  it('крайние подписи прижаты внутрь графика', () => {
    expect(axisAlignOf(0, 24)).toBe('start')
    expect(axisAlignOf(23, 24)).toBe('end')
    expect(axisAlignOf(6, 24)).toBe('center')
  })
})

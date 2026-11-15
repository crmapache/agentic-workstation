import { it, expect, describe } from 'vitest'

import {
  niceTop,
  shareOf,
  heightOf,
  maximaOf,
  tallestOf,
  scaleMaxOf,
  segmentsOf,
  axisAlignOf,
} from './BarChart.utils'

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

describe('shareOf и heightOf', () => {
  it('доля шкалы с краями 0 и 1', () => {
    expect(shareOf(5, 10)).toBe(0.5)
    expect(shareOf(12, 10)).toBe(1)
    expect(shareOf(-1, 10)).toBe(0)
    expect(shareOf(3, 0)).toBe(0)
  })

  it('высота столбца - процентом поля, выше шкалы не растёт', () => {
    expect(heightOf(5, 10)).toBe('50%')
    expect(heightOf(12, 10)).toBe('100%')
    expect(heightOf(0, 10)).toBe('0%')
  })
})

describe('maximaOf и tallestOf', () => {
  const points = [point('a', 2, 30), point('b', 9, 4), point('c', 9, 0)]

  it('рекорд у каждого ряда, число - над самым высоким столбцом графика', () => {
    expect(maximaOf(points, 2)).toEqual([9, 30])
    expect(tallestOf(points)).toEqual({ point: 0, series: 1, value: 30 })
  })

  it('из равных - первый; нули рекордом не бывают', () => {
    expect(tallestOf([point('a', 3), point('b', 3)])).toEqual({ point: 0, series: 0, value: 3 })
    expect(tallestOf([point('a', 0), point('b', 0)])).toBeNull()
    expect(maximaOf([], 2)).toEqual([0, 0])
  })
})

describe('stacked', () => {
  const points = [point('a', 2, 30), point('b', 25, 10), point('c', 0, 0)]

  it('шкала и число над вершиной - по сумме шага, метка - верхний кусок', () => {
    expect(scaleMaxOf(points, 'stacked')).toBe(35)
    expect(scaleMaxOf(points, 'overlaid')).toBe(30)
    expect(tallestOf(points, 'stacked')).toEqual({ point: 1, series: 1, value: 35 })
    expect(tallestOf([point('a', 4, 0)], 'stacked')).toEqual({ point: 0, series: 0, value: 4 })
  })
})

describe('segmentsOf', () => {
  it('рядом - все ряды как есть, стопкой - без нулей', () => {
    expect(segmentsOf(point('a', 0, 5), 'grouped')).toEqual([
      { series: 0, value: 0, height: 0 },
      { series: 1, value: 5, height: 5 },
    ])
    expect(segmentsOf(point('a', 0, 5), 'stacked')).toEqual([{ series: 1, value: 5, height: 5 }])
  })

  it('наложение: меньший снизу, больший растёт из него на разницу', () => {
    expect(segmentsOf(point('a', 50, 10), 'overlaid')).toEqual([
      { series: 1, value: 10, height: 10 },
      { series: 0, value: 50, height: 40 },
    ])
    expect(segmentsOf(point('a', 0, 30), 'overlaid')).toEqual([
      { series: 1, value: 30, height: 30 },
    ])
  })

  it('равные в наложении - одна метка, первого ряда', () => {
    expect(segmentsOf(point('a', 60, 60), 'overlaid')).toEqual([
      { series: 0, value: 60, height: 60 },
    ])
  })
})

describe('axisAlignOf', () => {
  it('крайние подписи прижаты внутрь графика', () => {
    expect(axisAlignOf(0, 24)).toBe('start')
    expect(axisAlignOf(23, 24)).toBe('end')
    expect(axisAlignOf(6, 24)).toBe('center')
  })
})

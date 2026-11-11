import { NICE_STEPS } from './BarChart.constants'
import type { TallestBar, BarChartPoint } from './BarChart.types'

/**
 * Верх шкалы: круглое число не ниже самого высокого столбца. У целых величин (строки,
 * вызовы) половина шкалы - тоже целая: «1.5 lines» на оси читалась бы как ошибка. Пустой
 * график - единица, чтобы доли не делились на ноль.
 */
export const niceTop = (max: number, integer: boolean): number => {
  if (!(max > 0)) return 1

  const magnitude = 10 ** Math.floor(Math.log10(max))

  for (const step of NICE_STEPS) {
    // toPrecision снимает хвост плавающей точки: 3 × 0.1 - это 0.30000000000000004.
    const top = Number((step * magnitude).toPrecision(12))

    if (top >= max && (!integer || Number.isInteger(top / 2))) return top
  }

  return Number((20 * magnitude).toPrecision(12))
}

/** Высота метки - доля шкалы от 0 до 1. */
export const shareOf = (value: number, top: number): number =>
  top > 0 ? Math.min(1, Math.max(0, value / top)) : 0

/** Высота столбца в поле - процентом: доля шкалы, которую он занимает. */
export const heightOf = (value: number, top: number): string => `${shareOf(value, top) * 100}%`

/** Рекорд каждого ряда: его самый высокий столбец ярче остальных. Ноль рекордом не бывает. */
export const maximaOf = (points: readonly BarChartPoint[], seriesCount: number): number[] =>
  Array.from({ length: seriesCount }, (_, series) =>
    Math.max(0, ...points.map((point) => point.values[series] ?? 0)),
  )

/**
 * Где стоит число над вершиной: самый высокий столбец всего графика (первый из равных).
 * Одно на график, а не по рекорду ряда: два числа над соседними столбцами одного шага
 * налезли бы друг на друга. Пустой график - нигде.
 */
export const tallestOf = (points: readonly BarChartPoint[]): TallestBar | null => {
  let best: TallestBar | null = null
  let height = 0

  for (const [index, point] of points.entries()) {
    for (const [series, value] of point.values.entries()) {
      if (value > height) {
        height = value
        best = { point: index, series }
      }
    }
  }

  return best
}

/** Как стоит подпись под осью: крайние прижаты внутрь, чтобы не вылезать за график. */
export const axisAlignOf = (index: number, count: number): 'start' | 'end' | 'center' =>
  index === 0 ? 'start' : index === count - 1 ? 'end' : 'center'

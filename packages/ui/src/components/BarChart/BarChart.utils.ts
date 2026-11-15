import { NICE_STEPS } from './BarChart.constants'
import type { BarSegment, TallestBar, BarChartPoint, BarChartLayout } from './BarChart.types'

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

/** Сумма шага - высота столбца stacked. */
const sumOf = (point: BarChartPoint): number =>
  point.values.reduce((sum, value) => sum + Math.max(0, value), 0)

/** Самое большое число на поле: от него - верх шкалы. У stacked - сумма шага. */
export const scaleMaxOf = (points: readonly BarChartPoint[], layout: BarChartLayout): number =>
  Math.max(
    0,
    ...points.map((point) => (layout === 'stacked' ? sumOf(point) : Math.max(0, ...point.values))),
  )

/**
 * Где стоит число над вершиной: самый высокий столбец всего графика (первый из равных).
 * Одно на график, а не по рекорду ряда: два числа над соседними столбцами одного шага
 * налезли бы друг на друга. У stacked - шаг с самой большой суммой, число - над верхним
 * куском. Пустой график - нигде.
 */
export const tallestOf = (
  points: readonly BarChartPoint[],
  layout: BarChartLayout = 'grouped',
): TallestBar | null => {
  let best: TallestBar | null = null

  for (const [index, point] of points.entries()) {
    if (layout === 'stacked') {
      const value = sumOf(point)
      const top = point.values.findLastIndex((part) => part > 0)

      if (value > (best?.value ?? 0)) best = { point: index, series: top, value }
      continue
    }

    for (const [series, value] of point.values.entries()) {
      if (value > (best?.value ?? 0)) best = { point: index, series, value }
    }
  }

  return best
}

/** Как стоит подпись под осью: крайние прижаты внутрь, чтобы не вылезать за график. */
export const axisAlignOf = (index: number, count: number): 'start' | 'end' | 'center' =>
  index === 0 ? 'start' : index === count - 1 ? 'end' : 'center'

/**
 * Метки шага снизу вверх. grouped - все ряды, как есть (рядом, нули держат место). stacked -
 * ряды без нулей, кусок на кусок. overlaid - ряды по возрастанию: меньший снизу, каждый
 * следующий продолжает столбец на свою разницу; равный предыдущему метки не даёт - его число
 * уже нарисовано (из равных снизу - первый по порядку рядов).
 */
export const segmentsOf = (point: BarChartPoint, layout: BarChartLayout): BarSegment[] => {
  const all = point.values.map((value, series) => ({ series, value, height: value }))

  if (layout === 'grouped') return all
  if (layout === 'stacked') return all.filter((part) => part.value > 0)

  let reached = 0

  return all
    .toSorted((a, b) => a.value - b.value)
    .map((part) => {
      const height = part.value - reached

      reached = Math.max(reached, part.value)

      return { ...part, height }
    })
    .filter((part) => part.height > 0)
}

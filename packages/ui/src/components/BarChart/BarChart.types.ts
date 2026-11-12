import type { ChartTone } from '../ChartTip/ChartTip.types'

/** Ряд графика: подпись (легенда, подсказка, таблица) и постоянный тон. */
export type BarChartSeries = { key: string; label: string; tone: ChartTone }

/** Шаг графика: час или день и числа рядов в нём. */
export type BarChartPoint = {
  key: string
  /** Полная подпись шага - в подсказке и таблице: «Tue, Nov 10, 14:00». */
  label: string
  /** Подпись под осью. Пустая - без подписи: их ставят через несколько шагов. */
  axisLabel?: string | undefined
  /** Числа рядов в порядке series. */
  values: readonly number[]
  /** Строка под числами в подсказке: цена шага, пояснение. */
  note?: string | undefined
}

export type BarChartProps = {
  /** Что на графике - имя для скринридера и подпись таблицы чисел. */
  label: string
  /** Один или два ряда - столбцы рядом; у двух и больше появляется легенда. */
  series: readonly BarChartSeries[]
  points: readonly BarChartPoint[]
  /** Число для людей: шкала, подсказка, таблица («12.4k», «1h 20m»). */
  formatValue: (value: number) => string
  /** Все числа - нули: слова посередине поля вместо пустых столбцов. */
  emptyLabel: string
  /** Величина целая (строки, вызовы): у шкалы нет половинок. */
  integer?: boolean | undefined
}

/** Самый высокий столбец графика - у него число над вершиной. */
export type TallestBar = { point: number; series: number }

export type BarSlotProps = {
  index: number
  point: BarChartPoint
  series: readonly BarChartSeries[]
  top: number
  /** Рекорд каждого ряда - его столбец полным тоном. */
  maxima: readonly number[]
  tallest: TallestBar | null
  active: boolean
  formatValue: (value: number) => string
}

export type BarTableProps = Pick<BarChartProps, 'label' | 'series' | 'points' | 'formatValue'>

export type BarTicksProps = { top: number; empty: boolean; formatValue: (value: number) => string }

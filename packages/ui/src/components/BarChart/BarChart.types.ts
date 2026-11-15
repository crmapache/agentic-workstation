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
  /** Шаг в выделенной полосе (выходные): подложка тише подсветки под рукой. */
  shaded?: boolean | undefined
  /** Шаг начинает новую группу (сутки на графике по часам): перед ним линия. */
  boundary?: boolean | undefined
}

/**
 * Как стоят ряды в шаге: grouped - рядом; stacked - один на другом, когда ряды складываются в
 * целое (строки руками и агентами - все строки часа); overlaid - меньший снизу, из него растёт
 * больший до своей высоты, когда складывать нельзя (минуты присутствия и работы агентов в одном
 * часе идут одновременно): столбец высотой с больший, а не с сумму. У stacked и overlaid
 * столбец шага всегда во всю его ширину.
 */
export type BarChartLayout = 'grouped' | 'stacked' | 'overlaid'

export type BarChartProps = {
  /** Что на графике - имя для скринридера и подпись таблицы чисел. */
  label: string
  /** Один ряд или несколько; у двух и больше появляется легенда. */
  series: readonly BarChartSeries[]
  points: readonly BarChartPoint[]
  /** Число для людей: шкала, подсказка, таблица («12.4k», «1h 20m»). */
  formatValue: (value: number) => string
  /** Все числа - нули: слова посередине поля вместо пустых столбцов. */
  emptyLabel: string
  /** Величина целая (строки, вызовы): у шкалы нет половинок. */
  integer?: boolean | undefined
  /** Как стоят ряды в шаге; по умолчанию grouped - рядом. */
  layout?: BarChartLayout | undefined
}

/**
 * Метка ряда в шаге: чей ряд, его число и высота метки на шкале. У grouped и stacked высота -
 * само число, у overlaid - на сколько ряд выше предыдущего, меньшего.
 */
export type BarSegment = { series: number; value: number; height: number }

/**
 * Самый высокий столбец графика - у него число над вершиной: метка ряда series в шаге point
 * и число над ней (у stacked - сумма шага, метка - верхний кусок).
 */
export type TallestBar = { point: number; series: number; value: number }

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
  layout: BarChartLayout
}

export type BarTableProps = Pick<BarChartProps, 'label' | 'series' | 'points' | 'formatValue'>

export type BarTicksProps = { top: number; empty: boolean; formatValue: (value: number) => string }

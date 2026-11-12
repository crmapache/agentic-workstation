import type { Ref } from 'react'

/**
 * Тон ряда графика - роль --color-chart-1..4 (кто или что, а не состояние) или other -
 * «остальное» доли. Ряд держит свой тон на всех графиках вида: человек везде первый,
 * агенты - второй.
 */
export type ChartTone = 'chart1' | 'chart2' | 'chart3' | 'chart4' | 'other'

/** Строка подсказки: число - главное, подпись ряда - тише, черта тона - чей это ряд. */
export type ChartTipRow = {
  key: string
  value: string
  label: string
  tone?: ChartTone | undefined
}

export type ChartTipProps = {
  /** Связка с меткой под рукой - из useChartTip. */
  tipRef: Ref<HTMLSpanElement>
  /** О чём подсказка: шаг графика, день календаря. */
  title: string
  rows: readonly ChartTipRow[]
  /** Мелкая строка под числами: цена шага, пояснение. */
  note?: string | undefined
}

/**
 * Пункт легенды графика: тон ряда, имя и, если нужно, число куска справа («98%», «12.4k · 2%»).
 * Ряд столбцов и кусок полосы долей подходят как есть.
 */
export type ChartLegendItem = {
  key: string
  label: string
  tone: ChartTone
  valueLabel?: string | undefined
}

export type ChartLegendProps = { items: readonly ChartLegendItem[] }

/**
 * Куда ходят стрелки: across - влево и вправо (столбец графика - на один, неделя
 * календаря - на семь дней), down - вверх и вниз (день недели в календаре); null - никуда.
 */
export type MarkSteps = { across: number; down: number | null }

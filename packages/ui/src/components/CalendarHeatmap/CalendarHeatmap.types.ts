import type { ChartTone } from '../ChartTip/ChartTip.types'

/** День календаря: число дня и его подписи - пакет текста не знает, их готовит вызывающий. */
export type CalendarHeatmapDay = {
  key: string
  value: number
  /** О каком дне - заголовок подсказки: «Tue, Nov 10». */
  label: string
  /** Число дня для людей: «2h 10m». */
  valueLabel: string
  /** Подпись месяца над неделей этого дня: ставится на первое число месяца. */
  monthLabel?: string | undefined
}

/** Ступень тона клетки: 0 - пустой день, 4 - самые занятые дни периода. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4

export type CalendarHeatmapProps = {
  /** Что в календаре одной фразой - для скринридера: серии, пик, сколько дней активно. */
  label: string
  /** Дни подряд: первый - понедельник первой недели, последний - сегодня. */
  days: readonly CalendarHeatmapDay[]
  /** Что считается: подпись числа в подсказке («Presence»). */
  seriesLabel: string
  tone?: ChartTone | undefined
  /** Подписи строк с понедельника по воскресенье; пустая - строка без подписи. */
  weekdayLabels: readonly string[]
  /** Края шкалы ступеней под календарём: «Less» и «More». */
  lessLabel: string
  moreLabel: string
}

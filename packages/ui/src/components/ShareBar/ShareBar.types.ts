import type { ChartTone } from '../ChartTip/ChartTip.types'

/** Кусок полосы: чья доля и сколько, подпись числа - для легенды. */
export type ShareBarSegment = {
  key: string
  label: string
  value: number
  tone: ChartTone
  /** Число куска для людей в легенде: «98%», «12.4k · 2%». */
  valueLabel?: string | undefined
}

export type ShareBarProps = {
  /** Что делит полоса одной фразой - для скринридера: «You 2%, agents 98%». */
  label: string
  segments: readonly ShareBarSegment[]
  /**
   * Шкала полосы. Больше суммы кусков - остаток стоит пустой дорожкой: строка рейтинга,
   * где доля - от самого большого. Нет - полоса делится целиком.
   */
  total?: number | undefined
  /** Подписи кусков под полосой: квадратик тона, имя и число. */
  legend?: boolean | undefined
}

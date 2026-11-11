import { WEEK_DAYS } from './CalendarHeatmap.constants'
import type { HeatLevel, CalendarHeatmapDay } from './CalendarHeatmap.types'

/** Значение доли p (0..1) среди упорядоченных чисел - без сглаживания, ближайшее снизу. */
const quantile = (sorted: readonly number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0

/**
 * Ступени дней, как у календаря GitHub: пустой день - 0, остальные - по четвертям среди
 * непустых дней, а не по доле от самого большого. Иначе один длинный день делал бы весь год
 * бледным: у работы хвост тяжёлый, и ровная шкала его не показывает. Самые занятые дни -
 * всегда полный тон, даже когда все непустые дни одинаковы.
 */
export const heatLevels = (values: readonly number[]): HeatLevel[] => {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b)
  const max = sorted.at(-1) ?? 0
  const bounds = [quantile(sorted, 0.25), quantile(sorted, 0.5), quantile(sorted, 0.75)]

  return values.map((value): HeatLevel => {
    if (!(value > 0)) return 0
    if (value >= max) return 4

    const above = bounds.filter((bound) => value > bound).length

    return above >= 2 ? 3 : above === 1 ? 2 : 1
  })
}

/**
 * Подписи месяцев над неделями: у недели - подпись первого её дня, на который она стоит.
 * Длина ответа - число недель.
 */
export const monthRow = (days: readonly CalendarHeatmapDay[]): string[] =>
  Array.from(
    { length: Math.ceil(days.length / WEEK_DAYS) },
    (_, week) =>
      days.slice(week * WEEK_DAYS, (week + 1) * WEEK_DAYS).find((day) => day.monthLabel)
        ?.monthLabel ?? '',
  )

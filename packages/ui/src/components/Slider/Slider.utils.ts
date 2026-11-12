/** Доля пути ползунка от 0 до 1: где кончается заливка шкалы. Пустой отрезок шкалы - ноль. */
export const sliderFraction = (value: number, min: number, max: number): number =>
  max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0

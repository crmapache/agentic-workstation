/** Сетка месяца - всегда шесть недель: высота панели не прыгает при листании месяцев. */
export const GRID_WEEKS = 6

export const WEEK_DAYS = 7

/** Стрелки месяцев - ростом с подпись месяца рядом. */
export const MONTH_ICON_SIZE = 14

/** Клавиши курсора по дням: сдвиг в днях. Home и End - к краю недели, PageUp и PageDown - месяц. */
export const DAY_STEPS: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -WEEK_DAYS,
  ArrowDown: WEEK_DAYS,
}

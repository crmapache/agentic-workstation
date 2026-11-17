/** Где кнопка над лентой: внизу у поля или наверху, если выделено у самого низа. */
export type QuotePlacement = 'bottom' | 'top'

/** Выделенное, которое можно процитировать, и где для него встаёт кнопка. */
export type QuotableSelection = { text: string; placement: QuotePlacement }

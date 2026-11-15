export type DatePickerProps = {
  /** Выбранный день - местная полночь. */
  value: number
  onChange: (day: number) => void
  /**
   * Сколько дней подсвечено полосой, кончаясь выбранным: 7 - неделя по выбранный день.
   * По умолчанию 1 - только он сам.
   */
  span?: number | undefined
  /** Сегодня - местная полночь: число дня отмечено тоном акцента. */
  today: number
  /** Самый ранний и самый поздний день, который можно выбрать; не задан - без края. */
  min?: number | undefined
  max?: number | undefined
  /** Месяц над сеткой: «November 2026». Пакет текста не знает - подписи готовит вызывающий. */
  monthLabel: (monthStart: number) => string
  /** День для скринридера: «Thu, Nov 12». */
  dayLabel: (day: number) => string
  /** Подписи столбцов с понедельника по воскресенье: «Mo», «Tu»… */
  weekdayLabels: readonly string[]
  previousMonthLabel: string
  nextMonthLabel: string
  /** Фокус на выбранный день при появлении: календарь во всплывающей панели. */
  autoFocus?: boolean | undefined
}

export type DayCellProps = {
  day: number
  /** День другого месяца в начале или конце сетки - тише. */
  outside: boolean
  selected: boolean
  inSpan: boolean
  today: boolean
  disabled: boolean
  /** На нём курсор клавиатуры: единственный день сетки, куда встаёт Tab. */
  focusable: boolean
  label: string
  onSelect: (day: number) => void
}

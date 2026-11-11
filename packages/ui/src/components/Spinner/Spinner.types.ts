/**
 * sm - рядом с мелким текстом (строки ленты, поле поиска), md - рядом с основным. around -
 * кольцо вокруг знака: занимает всю коробку, которую дал родитель, и рисуется тонко у её края,
 * чтобы номер внутри остался виден (текущая остановка дороги сценария).
 */
export type SpinnerSize = 'sm' | 'md' | 'around'

/**
 * accent - работа, за которой следят (задача в работе); neutral - тихое ожидание; warning - тон
 * «работает сам» там, где оранжевый занят под «ждёт человека» (прогон сценария).
 */
export type SpinnerTone = 'accent' | 'neutral' | 'warning'

export type SpinnerProps = {
  size?: SpinnerSize | undefined
  tone?: SpinnerTone | undefined
  /** Что ждём - для скринридера. Нет - знак декоративный, слова стоят рядом. */
  label?: string | undefined
}

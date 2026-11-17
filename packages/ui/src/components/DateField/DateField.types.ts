import type { DatePickerProps } from '../DatePicker/DatePicker.types'

export type DateFieldProps = Omit<DatePickerProps, 'onChange' | 'autoFocus' | 'span'> & {
  /** Подпись над полем: «Date», «On». */
  label: string
  /** Выбранный день словами - так он стоит в поле («Tue, Dec 1»). */
  valueLabel: string
  onChange: (day: number) => void
}

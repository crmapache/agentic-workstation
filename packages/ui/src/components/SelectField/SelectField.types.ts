import type { ReactNode, ButtonHTMLAttributes } from 'react'

export type SelectFieldProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'children' | 'aria-label' | 'aria-haspopup' | 'value'
> & {
  /** Подпись над полем: что выбирают (сценарий, провайдер, куда). */
  label: string
  /** Подпись не видна, но остаётся для скринридера: подпись уже стоит рядом (час и минуты). */
  hideLabel?: boolean | undefined
  /** Что выбрано; null - ещё ничего, в поле тогда приглушённый placeholder. */
  value: string | null
  /** Что написано в поле, пока ничего не выбрано: «Choose a scenario». */
  placeholder?: string | undefined
  /** Значок слева от значения: иконка провайдера, аватар. */
  leading?: ReactNode | undefined
  /** По ширине значения, а не на всю строку формы: час и минуты в ряд. */
  fit?: boolean | undefined
}

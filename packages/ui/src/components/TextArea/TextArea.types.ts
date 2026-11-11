import type { Ref, TextareaHTMLAttributes } from 'react'

export type TextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'className' | 'value' | 'onChange' | 'aria-label' | 'rows'
> & {
  label: string
  /** Подпись не видна, но остаётся для скринридера: подпись уже стоит над полем (Section). */
  hideLabel?: boolean | undefined
  value: string
  onChange: (value: string) => void
  /** Что не так с введённым. Показывается под полем красным. */
  error?: string | undefined
  ref?: Ref<HTMLTextAreaElement> | undefined
}

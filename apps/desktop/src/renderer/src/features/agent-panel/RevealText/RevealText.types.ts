import type { ElementType } from 'react'

export type RevealTextProps = {
  /** Простой текст: волна идёт по строке, разметки внутри быть не может. */
  children: string
  /** Элемент вокруг текста: span в строке, pre у блока кода. */
  as?: ElementType | undefined
  className?: string | undefined
}

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Кусок текста: с какого символа и сколько. */
export type TextRange = {
  start: number
  length: number
}

/**
 * md - строка списка окна: подпись и пояснение в одну строку. touch - под палец на телефоне: не
 * ниже цели касания, пояснение под подписью в две строки (в одной строке на узком экране от него
 * остаётся десяток знаков).
 */
export type ListBoxOptionSize = 'md' | 'touch'

export type ListBoxOptionProps = {
  /** optionId(index) из useListBox: на выделенный вариант указывает поле. */
  id: string
  label: string
  /** Места подписи, совпавшие с запросом: подсвечены. */
  highlight?: readonly TextRange[] | undefined
  /** Подпись - строка кода (найденный текст): моноширинным шрифтом. */
  code?: boolean | undefined
  /** Серым после подписи в той же строке: папка файла. Не помещается - обрезается первой. */
  description?: string | undefined
  icon?: LucideIcon | undefined
  /** Своя картинка слева вместо иконки: значок проекта. */
  leading?: ReactNode | undefined
  /** Справа серым: сочетание клавиш, файл и номер строки. */
  hint?: string | undefined
  size?: ListBoxOptionSize | undefined
  /** Выделен - клавишами или мышью. Enter выберет его. */
  active: boolean
  onSelect: () => void
  /** Мышь пришла на вариант: он становится выделенным, как в WebStorm. */
  onActivate: () => void
}

/** Подпись, разрезанная на обычные и подсвеченные куски. */
export type TextSegment = {
  text: string
  isMatch: boolean
}

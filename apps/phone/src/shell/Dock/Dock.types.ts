import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type DockProps = {
  icon: LucideIcon
  title: string
  /** Строка под заголовком: инструмент, сколько вопросов ещё ждёт. */
  description?: string | undefined
  /** Кнопки решения - ряд под прокруткой, всегда на виду. */
  actions: ReactNode
  /** Что решают: вызов, план, вопросы, поле своих слов - прокручивается, если не влезло. */
  children: ReactNode
}

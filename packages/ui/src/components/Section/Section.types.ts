import type { ReactNode } from 'react'

/**
 * lg - раздел вида: заголовок жирным и линия под шапкой раздела. sm - раздел внутри окна
 * или карточки: подпись капсом, без линии.
 */
export type SectionSize = 'lg' | 'sm'

export type SectionProps = {
  title: string
  /** Сколько в разделе рядом с заголовком: число или «12 of 25». */
  count?: number | string | undefined
  /**
   * Строка под заголовком - короткое состояние раздела («пока пусто»). Пояснение, что это
   * и как работает, - не сюда, а в help.
   */
  description?: string | undefined
  /** У правого края шапки, после действий: кнопка справки (HelpButton). */
  help?: ReactNode | undefined
  /** Справа в шапке раздела: действие над всем разделом. */
  actions?: ReactNode | undefined
  size?: SectionSize | undefined
  children: ReactNode
}

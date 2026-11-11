import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** neutral - сводка, блок настроек, план; accent - ход ждёт человека (вопрос, разрешение). */
export type CardTone = 'neutral' | 'accent'

/**
 * md - обычная карточка: шапка, линия под ней, просторное тело. sm - плотная плитка
 * (сводка цифр): без линии под шапкой, поля меньше - цифра стоит сразу под подписью.
 */
export type CardSize = 'md' | 'sm'

export type CardProps = {
  /** Заголовок карточки. Нет - карточка без шапки, просто стеклянный лист. */
  title?: string | undefined
  /** Сколько всего в карточке - число справа в шапке, моноширинным: телефоны, токены. */
  count?: number | string | undefined
  /** Мелкая строка под заголовком - короткое состояние. Пояснение - в help. */
  description?: string | undefined
  /** У правого края шапки, после действий: кнопка справки (HelpButton). */
  help?: ReactNode | undefined
  /** Иконка перед заголовком. */
  icon?: LucideIcon | undefined
  tone?: CardTone | undefined
  size?: CardSize | undefined
  /** Справа в шапке: кнопка, метка. */
  actions?: ReactNode | undefined
  /**
   * Не выше своего места: шапка стоит, тело сжимается до оставшейся высоты, а прокрутку внутри
   * тела решает содержимое (вопрос над полем ввода телефона: прокручивается текст, кнопки ответа
   * на виду). Без fit карточка растёт по содержимому.
   */
  fit?: boolean | undefined
  children: ReactNode
}

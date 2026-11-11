import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import type { BadgeTone } from '../Badge/Badge.types'

export type MenuItemProps = {
  label: string
  /** Вторая строка мельче: путь проекта и подобное. */
  description?: string | undefined
  /**
   * Вторая строка - объяснение, а не значение: переносится целиком, а не режется
   * многоточием (почему пункт погашен, что не вернётся). Путь и имя - режутся.
   */
  wrapDescription?: boolean | undefined
  /** Иконка слева. Для значка или своей картинки - leading. */
  icon?: LucideIcon | undefined
  leading?: ReactNode | undefined
  /** Текущий выбор: текущий проект, текущая ветка. Подсвечен постоянно. */
  current?: boolean | undefined
  disabled?: boolean | undefined
  /** Подсказка справа серым: «not built yet», сочетание клавиш, значение настройки. */
  hint?: string | undefined
  /** Подсказка - состояние, а не число: цвет тона и точка перед ней («Connected»). */
  hintTone?: BadgeTone | undefined
  /** Иконка в тонированной плитке: строка бокового меню, где у каждого пункта свой цвет. */
  iconTone?: BadgeTone | undefined
  /** Справа стрелка: пункт открывает следующий экран, а не делает действие. */
  chevron?: boolean | undefined
  /**
   * Пункт - вариант выбора: single - один из многих, multiple - сколько угодно. Слева
   * отметка ChoiceMark, а меню на выбор не закрывается, если вариантов несколько.
   */
  selection?: 'single' | 'multiple' | undefined
  /** Отмечен ли вариант выбора. */
  checked?: boolean | undefined
  /**
   * Выбор не закрывает панель: за ним в той же панели следующий шаг (выбрали модель - дальше
   * её усилие). Панель закроет последний шаг или человек.
   */
  keepOpen?: boolean | undefined
  onSelect: () => void
}

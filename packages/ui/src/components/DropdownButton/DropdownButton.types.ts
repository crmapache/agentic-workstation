import type { ReactNode, ButtonHTMLAttributes } from 'react'

/** md - шапка окна; sm - плотная строка под полем ввода (модель, режим). */
export type DropdownButtonSize = 'sm' | 'md'

export type DropdownButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'children' | 'aria-label' | 'aria-haspopup'
> & {
  /** Что сейчас выбрано: имя проекта, ветки. */
  label: string
  /**
   * Значение на кнопке вместо label, когда в нём несколько частей своего цвета (модель,
   * усилие и режим под полем ввода). label тогда - подпись для скринридера.
   */
  labelContent?: ReactNode | undefined
  /** Значок слева: Avatar или иконка. */
  leading?: ReactNode | undefined
  /** Подпись для скринридера: что переключает кнопка. */
  menuLabel: string
  size?: DropdownButtonSize
  /**
   * Стрелка вниз после значения; false - без неё, когда кнопка и так читается выбором (дата
   * между стрелками листания периода). По умолчанию есть.
   */
  chevron?: boolean | undefined
}

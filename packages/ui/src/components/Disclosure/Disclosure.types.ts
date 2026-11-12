import type { ReactNode, ButtonHTMLAttributes } from 'react'

/**
 * sm - строка в списке (вызов в ленте); md - шапка карточки, которая раскрывается; touch - строка
 * ленты на телефоне: не ниже цели касания.
 */
export type DisclosureSize = 'sm' | 'md' | 'touch'

export type DisclosureProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'children' | 'aria-expanded'
> & {
  expanded: boolean
  size?: DisclosureSize
  /** Содержимое строки после стрелки: иконка, подпись, состояние справа. */
  children: ReactNode
}

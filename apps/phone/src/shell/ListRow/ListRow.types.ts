import type { ReactNode } from 'react'

export type ListRowProps = {
  title: string
  /** Строка под заголовком: состояние, сколько, с какого времени. */
  description?: ReactNode | undefined
  /** Слева: значок, аватар проекта, отметка. */
  leading?: ReactNode | undefined
  /** Справа: метка состояния. */
  trailing?: ReactNode | undefined
  /** Есть - строка нажимается целиком и ведёт дальше (стрелка справа). */
  onClick?: (() => void) | undefined
  /** Приглушённая: недавний проект, закрытая очередь. */
  muted?: boolean | undefined
}

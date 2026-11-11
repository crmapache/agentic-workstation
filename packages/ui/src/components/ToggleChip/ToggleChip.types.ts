import type { ReactNode } from 'react'

export type ToggleChipProps = {
  label: string
  pressed: boolean
  /** Знак слева: значок проекта (Avatar), иконка. */
  leading?: ReactNode | undefined
  /** Подсказка по наведению: то, чего нет в подписи (полный путь). */
  hint?: string | undefined
  onChange: (pressed: boolean) => void
}

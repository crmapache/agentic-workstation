import type { ReactNode } from 'react'

import type { TooltipPlacement } from '../Tooltip/Tooltip.types'

/**
 * md - ряд плашек в форме и окне; sm - плотная строка под полем ввода (пресеты, ADR 0096);
 * touch - под палец (телефон): не ниже --size-touch-target.
 */
export type ToggleChipSize = 'md' | 'sm' | 'touch'

export type ToggleChipProps = {
  label: string
  pressed: boolean
  /** Знак слева: значок проекта (Avatar), иконка. */
  leading?: ReactNode | undefined
  /** Подсказка по наведению: то, чего нет в подписи (полный путь). */
  hint?: string | undefined
  /** Где встаёт подсказка: у строки под полем ввода - сверху, как у соседнего индикатора. */
  hintPlacement?: TooltipPlacement | undefined
  size?: ToggleChipSize | undefined
  /** Плашки ряда делят его поровну, подпись по центру (пресеты на телефоне); иначе - по подписи. */
  fill?: boolean | undefined
  onChange: (pressed: boolean) => void
}

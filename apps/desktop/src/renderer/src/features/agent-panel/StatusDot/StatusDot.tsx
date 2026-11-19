import clsx from 'clsx'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from './StatusDot.module.scss'
import type { StatusDotProps } from './StatusDot.types'

/**
 * Точка состояния разговора на вкладке и в строке «что сейчас». Цвет - смыслом
 * (ADR 0006): серая - пусто, жёлтая с дыханием - работает, зелёная - ход закончен,
 * оранжевая с дыханием - ждёт тебя, красная - процесс умер. С подсказкой - говорит
 * словами, что с вкладкой.
 */
export const StatusDot = ({ status, hint }: StatusDotProps) => {
  const state = status === 'waiting' ? 'attention' : status
  const dot = <span className={clsx(styles.statusDot, styles[state])} aria-hidden />

  return hint ? <Tooltip label={hint}>{dot}</Tooltip> : dot
}

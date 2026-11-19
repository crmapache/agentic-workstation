import clsx from 'clsx'

import styles from '../AgentCard.module.scss'
import type { AgentDurationProps } from '../AgentCard.types'
import { elapsedMs } from '../../agents.utils'
import { useNow } from '../../clock.hooks'
import { TICK_MS } from '../../panel.constants'
import { formatDuration } from '../../panel.utils'

/**
 * Время агента справа в шапке: тикает, пока идёт, потом - сколько шёл. Своим
 * компонентом: каждую секунду перерисовывается цифра, а не карточка.
 */
export const AgentDuration = ({ tool }: AgentDurationProps) => {
  const isRunning = tool.status === 'running'
  const now = useNow(isRunning, TICK_MS)
  const ms = elapsedMs(tool, now)

  if (ms === 0 && !isRunning) return null

  return (
    <span className={clsx(styles.duration, isRunning && styles.running)}>{formatDuration(ms)}</span>
  )
}

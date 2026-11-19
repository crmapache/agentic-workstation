import { useNow } from '../clock.hooks'
import { TICK_MS } from '../panel.constants'
import { formatDuration } from '../panel.utils'
import styles from './ElapsedTime.module.scss'
import type { ElapsedTimeProps } from './ElapsedTime.types'

/**
 * Длительность справа в шапке вызова, группы, субагента: у законченного - сколько шёл,
 * у идущего - тикает раз в секунду. Начало или конец неизвестны - пусто.
 */
export const ElapsedTime = ({ startedAt, endedAt }: ElapsedTimeProps) => {
  const isLive = startedAt > 0 && endedAt === 0
  const now = useNow(isLive, TICK_MS)

  // Конец совпал с началом - длительность неизвестна (вызов, оборванный в транскрипте).
  if (startedAt <= 0 || endedAt === startedAt) return null

  return <span className={styles.elapsedTime}>{formatDuration((endedAt || now) - startedAt)}</span>
}

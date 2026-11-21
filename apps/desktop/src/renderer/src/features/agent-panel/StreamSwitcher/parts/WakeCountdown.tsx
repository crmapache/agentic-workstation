import { useTranslation } from 'react-i18next'

import styles from '../StreamSwitcher.module.scss'
import type { WakeCountdownProps } from '../StreamSwitcher.types'
import { formatCountdown } from '../StreamSwitcher.utils'
import { useNow } from '../../clock.hooks'
import { TICK_MS } from '../../panel.constants'

/** Сколько осталось до будильника - тикает своим компонентом, чтобы не перерисовывать ряд. */
export const WakeCountdown = ({ dueAt }: WakeCountdownProps) => {
  const { t } = useTranslation()
  const now = useNow(dueAt > 0, TICK_MS)

  if (!dueAt) return null

  return (
    <span className={styles.duration}>
      {t('agentPanel.agents.streams.wakeIn', { duration: formatCountdown(dueAt - now) })}
    </span>
  )
}

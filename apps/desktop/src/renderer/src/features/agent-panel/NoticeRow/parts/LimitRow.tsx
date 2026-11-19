import { useTranslation } from 'react-i18next'

import { LIMIT_TICK_MS } from '../NoticeRow.constants'
import styles from '../NoticeRow.module.scss'
import type { LimitRowProps } from '../NoticeRow.types'
import { resetClock, untilReset, limitWindow } from '../NoticeRow.utils'
import { useNow } from '../../clock.hooks'
import { LabelRow } from './LabelRow'

/**
 * LIMIT / EXTRA USAGE: лимит кончился - не красным, ничего не сломалось. Ожидание сброса
 * уходит из ленты, как только сброс наступил: стоя дальше, строка говорила бы неправду.
 */
export const LimitRow = ({ item }: LimitRowProps) => {
  const { t } = useTranslation()
  const isWaiting = item.state === 'limit' && item.resetsAt > 0
  const now = useNow(isWaiting, LIMIT_TICK_MS)
  const left = item.resetsAt ? untilReset(item.resetsAt, now) : null
  const window = limitWindow(t, item)

  if (isWaiting && left === null) return null

  return (
    <LabelRow
      label={
        item.state === 'extra'
          ? t('agentPanel.notice.limit.extraLabel')
          : t('agentPanel.notice.limit.label')
      }
      tone="warning"
      aside={
        isWaiting &&
        left && (
          <span className={styles.aside}>
            {t('agentPanel.notice.limit.resetAt', { clock: resetClock(item.resetsAt), left })}
          </span>
        )
      }>
      {item.state === 'extra'
        ? window
          ? t('agentPanel.notice.limit.extraNamed', { window })
          : t('agentPanel.notice.limit.extra')
        : window
          ? t('agentPanel.notice.limit.waitingNamed', { window })
          : t('agentPanel.notice.limit.waiting')}
    </LabelRow>
  )
}

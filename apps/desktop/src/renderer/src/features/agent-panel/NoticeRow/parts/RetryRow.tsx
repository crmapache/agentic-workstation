import { useTranslation } from 'react-i18next'

import { RETRY_TICK_MS } from '../NoticeRow.constants'
import styles from '../NoticeRow.module.scss'
import type { RetryRowProps } from '../NoticeRow.types'
import { retryText } from '../NoticeRow.utils'
import { useNow } from '../../clock.hooks'
import { formatDuration } from '../../panel.utils'
import { LabelRow } from './LabelRow'

/** RETRY: причина, попытка из скольких, отсчёт до следующей; потом - чем кончилось. */
export const RetryRow = ({ item }: RetryRowProps) => {
  const { t } = useTranslation()
  const now = useNow(item.pending, RETRY_TICK_MS)
  const left = Math.max(0, Math.ceil((item.retryAt - now) / 1000))
  const aside = item.pending
    ? left > 0
      ? t('agentPanel.notice.retry.retryingIn', { seconds: left })
      : t('agentPanel.notice.retry.retrying')
    : formatDuration(item.durationMs)

  return (
    <LabelRow
      label={t('agentPanel.notice.retry.label')}
      pending={item.pending}
      tone={item.outcome === 'failed' ? 'danger' : 'neutral'}
      aside={<span className={styles.aside}>{aside}</span>}>
      {retryText(t, item)}
    </LabelRow>
  )
}

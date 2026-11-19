import { useTranslation } from 'react-i18next'

import { COMPACT_TICK_MS } from '../NoticeRow.constants'
import styles from '../NoticeRow.module.scss'
import type { CompactRowProps } from '../NoticeRow.types'
import { compactText, compactProgress } from '../NoticeRow.utils'
import { useNow } from '../../clock.hooks'
import { LabelRow } from './LabelRow'

/**
 * CONTEXT: компакт вживую с процентом по часам, потом «до и после». Процент - сразу за
 * словами, как цифры строки статуса, а не у правого края: там он отрывался от того, к чему
 * относится.
 */
export const CompactRow = ({ item }: CompactRowProps) => {
  const { t } = useTranslation()
  const now = useNow(item.pending, COMPACT_TICK_MS)
  const percent = compactProgress(now - item.startedAt)

  return (
    <LabelRow label={t('agentPanel.notice.compact.label')} pending={item.pending}>
      {compactText(t, item)}
      {item.pending && <span className={styles.progress}>{`${percent}%`}</span>}
    </LabelRow>
  )
}

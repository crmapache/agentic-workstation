import { useState } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { trimHunks, hunksOfRows } from '../diff.utils'
import { DIFF_SIGN, DIFF_COLLAPSE_SLACK, DIFF_COLLAPSED_ROWS } from './DiffView.constants'
import styles from './DiffView.module.scss'
import type { DiffViewProps } from './DiffView.types'

/**
 * Дифф правки, как в ACC: куски с шапкой «@@ 120 @@ +a −r», номер строки, знак и строка на
 * тонированной подложке. Длинный показан началом, и строка «… N more lines» сама его
 * раскрывает и сворачивает обратно («… collapse»).
 */
export const DiffView = ({
  rows,
  collapsedRows = DIFF_COLLAPSED_ROWS,
  expanded,
  onToggle,
}: DiffViewProps) => {
  const { t } = useTranslation()
  const [ownExpanded, setOwnExpanded] = useState(false)
  const isExpanded = expanded ?? ownExpanded
  const all = hunksOfRows(rows)
  const preview = trimHunks(all, collapsedRows, DIFF_COLLAPSE_SLACK)
  const hunks = isExpanded ? all : preview.hunks

  const handleToggle = () => (onToggle ? onToggle() : setOwnExpanded((value) => !value))

  return (
    <div className={styles.diffView}>
      <div className={styles.scroller}>
        {hunks.map((hunk, index) => (
          <div key={index} className={styles.hunk}>
            <div className={styles.hunkHead}>
              <span className={styles.range}>
                {hunk.start === null
                  ? t('agentPanel.feed.diff.rangeUnknown')
                  : t('agentPanel.feed.diff.range', { line: hunk.start })}
              </span>
              <span className={styles.note}>
                {t('agentPanel.feed.diff.note', { added: hunk.added, removed: hunk.removed })}
              </span>
            </div>
            {hunk.rows.map((row, rowIndex) => (
              <div key={rowIndex} className={clsx(styles.row, styles[row.kind])}>
                <span className={styles.number}>{row.kind === 'del' ? '' : (row.line ?? '')}</span>
                <span className={styles.sign}>{DIFF_SIGN[row.kind]}</span>
                <span className={styles.text}>{row.text}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {preview.hidden > 0 && (
        <button type="button" className={styles.more} onClick={handleToggle}>
          {isExpanded
            ? t('agentPanel.feed.tool.fewerLines')
            : t('agentPanel.feed.tool.moreLines', { count: preview.hidden })}
        </button>
      )}
    </div>
  )
}

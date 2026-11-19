import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import styles from '../ToolRow.module.scss'
import type { ToolDetailsProps } from '../ToolRow.types'
import { CLOSED_KEYS } from '../../ToolStatus/ToolStatus.constants'

/**
 * Тело раскрытого вызова: строки вывода с тоном, сколько не показано, пометка про
 * обрезанный вывод; у закрытого без результата - почему (словами ACC).
 */
export const ToolDetails = ({ tool, lines, hidden }: ToolDetailsProps) => {
  const { t } = useTranslation()

  if (lines.length === 0 && tool.status === 'interrupted') {
    return (
      <div className={styles.details}>
        <div className={styles.note}>{t(CLOSED_KEYS[tool.closedReason ?? 'turnEnded'])}</div>
      </div>
    )
  }

  return (
    <div className={styles.details}>
      {lines.map((line, index) => (
        <div
          key={index}
          className={clsx(
            styles.line,
            line.tone === 'ok' && styles.ok,
            line.tone === 'bad' && styles.bad,
          )}>
          {line.text}
        </div>
      ))}
      {hidden > 0 && (
        <div className={styles.note}>{t('agentPanel.feed.tool.moreLines', { count: hidden })}</div>
      )}
      {tool.result?.truncated && (
        <div className={styles.note}>{t('agentPanel.feed.truncated')}</div>
      )}
    </div>
  )
}

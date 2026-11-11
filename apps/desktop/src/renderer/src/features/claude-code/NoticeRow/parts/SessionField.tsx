import { Copy, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../NoticeRow.module.scss'
import type { SessionFieldProps } from '../NoticeRow.types'
import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../../claude.constants'
import { useCopy } from '../../clipboard.hooks'

/** Поле строки SESSION: подпись и значение, которое копируется нажатием. */
export const SessionField = ({ name, note, value }: SessionFieldProps) => {
  const { t } = useTranslation()
  const { isCopied, copy } = useCopy()
  const Icon = isCopied ? Check : Copy

  const handleCopy = () => copy(value)

  return (
    <div className={styles.sessionField}>
      <p className={styles.sessionCaption}>
        <span className={styles.sessionName}>{name}</span>
        {note && <span className={styles.sessionNote}>{note}</span>}
      </p>
      <Tooltip
        label={isCopied ? t('claudeCode.notice.copied') : t('claudeCode.notice.clickToCopy')}>
        <button type="button" className={styles.sessionValue} onClick={handleCopy}>
          <code className={styles.sessionCode}>{value}</code>
          <Icon size={ROW_ICON_SIZE} strokeWidth={ROW_ICON_STROKE} aria-hidden />
        </button>
      </Tooltip>
    </div>
  )
}

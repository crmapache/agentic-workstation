import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import styles from './ToolStatus.module.scss'
import type { ToolStatusProps } from './ToolStatus.types'
import { metaText } from './ToolStatus.utils'

/**
 * Итог вызова в шапке, как в ACC: «· running», «· waiting for you» у вызова, который
 * ждёт разрешения, «· 12 lines», «· +2 −1» (большая правка без диффа CLI - «· ±»),
 * «· failed», почему закрыт без результата.
 */
export const ToolStatus = ({ meta, running, awaiting }: ToolStatusProps) => {
  const { t } = useTranslation()
  const text = running ? '' : metaText(t, meta)
  const isFailed = meta.kind === 'failed' || meta.kind === 'denied'

  if (running) {
    return (
      <span className={clsx(styles.meta, awaiting ? styles.waiting : styles.running)}>
        {awaiting ? t('claudeCode.feed.tool.waitingForYou') : t('claudeCode.feed.tool.running')}
      </span>
    )
  }

  return text ? <span className={clsx(styles.meta, isFailed && styles.failed)}>{text}</span> : null
}

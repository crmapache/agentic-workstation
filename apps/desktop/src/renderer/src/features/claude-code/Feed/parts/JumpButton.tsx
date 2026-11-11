import { ArrowDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../Feed.module.scss'
import type { JumpButtonProps } from '../Feed.types'

/**
 * Круглая кнопка «вниз» справа внизу, как в ACC: «Jump to latest», с числом строк,
 * пришедших, пока ленту читали выше.
 */
export const JumpButton = ({ unread, onJump }: JumpButtonProps) => {
  const { t } = useTranslation()

  return (
    <div className={styles.jump}>
      <IconButton icon={ArrowDown} label={t('claudeCode.feed.jumpToLatest')} onClick={onJump} />
      {unread > 0 && (
        <span className={styles.unread} aria-hidden>
          {unread}
        </span>
      )}
    </div>
  )
}

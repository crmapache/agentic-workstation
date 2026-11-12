import { useState } from 'react'
import { Brain } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Disclosure } from '@agentic-workstation/ui/Disclosure'

import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../Feed.constants'
import styles from '../Feed.module.scss'
import { text, count } from '../Feed.utils'

/** Размышления модели строкой; текст (если модель его показала) - по нажатию. */
export const ThinkingItem = ({ item }: { item: FeedItemWire }) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const words = text(item, 'text')
  const tokens = count(item, 'tokens')

  return (
    <div className={styles.toolItem}>
      <Disclosure
        size="touch"
        expanded={isOpen}
        disabled={!words}
        onClick={() => setIsOpen((open) => !open)}>
        <Brain size={ROW_ICON_SIZE} strokeWidth={ROW_ICON_STROKE} aria-hidden />
        <span className={styles.toolName}>{t('feed.thinking')}</span>
        {tokens > 0 && <span className={styles.tokens}>{t('feed.tokens', { count: tokens })}</span>}
      </Disclosure>
      {isOpen && words && <p className={styles.thinking}>{words}</p>}
    </div>
  )
}

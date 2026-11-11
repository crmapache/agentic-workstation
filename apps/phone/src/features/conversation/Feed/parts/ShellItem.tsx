import { useState } from 'react'
import { SquareTerminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Disclosure } from '@agentic-workstation/ui/Disclosure'

import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../Feed.constants'
import styles from '../Feed.module.scss'
import { text } from '../Feed.utils'

/** Команда «!», запущенная за столом: на телефоне её только видно, запустить свою нельзя. */
export const ShellItem = ({ item }: { item: FeedItemWire }) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const output = [text(item, 'stdout'), text(item, 'stderr')].filter(Boolean).join('\n')

  return (
    <div className={styles.toolItem}>
      <Disclosure
        size="touch"
        expanded={isOpen}
        disabled={!output}
        onClick={() => setIsOpen((open) => !open)}>
        <SquareTerminal size={ROW_ICON_SIZE} strokeWidth={ROW_ICON_STROKE} aria-hidden />
        <span className={styles.toolSummary}>{text(item, 'command')}</span>
        <span className={styles.steps}>
          {t(`feed.shellStatus.${text(item, 'status')}`, { defaultValue: '' })}
        </span>
      </Disclosure>
      {isOpen && <pre className={styles.output}>{output}</pre>}
    </div>
  )
}

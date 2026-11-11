import { memo, useMemo } from 'react'
import { X, Pin } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../PinnedBar.module.scss'
import type { PinnedRowProps } from '../PinnedBar.types'
import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../../claude.constants'
import { pinHint, pinLine } from '../../pins.utils'

/**
 * Одна закреплённая строка: вся строка - кнопка прыжка, рядом крестик. Две кнопки
 * рядом, а не одна в другой: кнопку в кнопке браузер не держит. memo: под полкой
 * печатается ответ, а закреплённое не меняется.
 */
export const PinnedRow = memo(({ item, onJump, onUnpin }: PinnedRowProps) => {
  const { t } = useTranslation()
  const line = useMemo(() => pinLine(item), [item])
  const hint = useMemo(() => pinHint(item), [item])
  const who = item.kind === 'user' ? t('claudeCode.message.you') : t('claudeCode.pins.claude')

  const handleJump = () => onJump(item.id)

  const handleUnpin = () => onUnpin(item.id)

  return (
    <div className={styles.row}>
      <Tooltip label={hint} stretch>
        <button type="button" className={styles.jump} onClick={handleJump}>
          {/* Та же булавка, что на кнопке карточки: по ней строка и узнаётся. */}
          <Pin
            className={styles.mark}
            size={ROW_ICON_SIZE}
            strokeWidth={ROW_ICON_STROKE}
            fill="currentColor"
            aria-hidden
          />
          <span className={styles.who}>{who}</span>
          <span className={styles.text}>{line}</span>
        </button>
      </Tooltip>
      <IconButton icon={X} size="sm" label={t('claudeCode.pins.remove')} onClick={handleUnpin} />
    </div>
  )
})

PinnedRow.displayName = 'PinnedRow'

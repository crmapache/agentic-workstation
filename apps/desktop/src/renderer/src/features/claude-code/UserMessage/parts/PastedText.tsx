import { memo, useMemo, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Disclosure } from '@agentic-workstation/ui/Disclosure'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../UserMessage.module.scss'
import type { PastedTextProps } from '../UserMessage.types'
import { pasteLineCount } from '../../chips.utils'
import { useCopy } from '../../clipboard.hooks'
import { pasteBody, pasteBlockPreview } from '../../message.utils'
import { SentChip } from './SentChip'

/**
 * Свёрнутая вставка в сообщении - единственное вложение, которое больше негде
 * прочитать: раскрывается прямо в карточке. Последняя в сообщении - во всю ширину с
 * первыми строками, посреди фразы - чипом, а раскрытый текст встаёт под ним. Сворачивает
 * только шапка: щелчок внутри текста - это выделение строки.
 */
export const PastedText = memo(({ chip, isBlock }: PastedTextProps) => {
  const { t } = useTranslation()
  const { isCopied, copy } = useCopy()
  const [isOpen, setIsOpen] = useState(false)
  const text = chip.text ?? ''
  // Вставка бывает в сотню килобайт, а лента перерисовывается на каждый кусок ответа.
  const lines = useMemo(() => pasteLineCount(text), [text])
  const body = useMemo(() => (isOpen ? pasteBody(text) : null), [isOpen, text])
  const count = t('claudeCode.message.pastedLines', { count: lines })

  const handleToggle = () => setIsOpen((open) => !open)

  const handleCopy = () => copy(text)

  if (!body) {
    return isBlock ? (
      <div className={styles.pasteBlock}>
        <Disclosure expanded={false} onClick={handleToggle}>
          <span className={styles.pasteCount}>{count}</span>
        </Disclosure>
        <div className={styles.pastePreview}>{pasteBlockPreview(text)}</div>
      </div>
    ) : (
      <button type="button" className={styles.pasteChip} aria-label={count} onClick={handleToggle}>
        <SentChip chip={chip} />
      </button>
    )
  }

  return (
    <>
      {!isBlock && <SentChip chip={chip} />}
      <div className={styles.pasteBlock}>
        <div className={styles.pasteHead}>
          <Disclosure
            expanded
            onClick={handleToggle}
            aria-label={t('claudeCode.message.pasteClose')}>
            <span className={styles.pasteCount}>{count}</span>
          </Disclosure>
          {/* Копия берёт вставку целиком, сколько бы её ни было на экране. */}
          <IconButton
            icon={isCopied ? Check : Copy}
            size="sm"
            label={isCopied ? t('claudeCode.message.copied') : t('claudeCode.message.copyPaste')}
            onClick={handleCopy}
          />
        </div>
        <div className={styles.pasteBody}>{body.text}</div>
        {body.shownLines < body.lines && (
          <div className={styles.pasteCut}>
            {t('claudeCode.message.pasteShown', { shown: body.shownLines, total: body.lines })}
          </div>
        )}
      </div>
    </>
  )
})

PastedText.displayName = 'PastedText'

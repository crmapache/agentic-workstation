import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useComposerStore } from '../composer.store'
import { EMPTY_DRAFT } from '../draft.utils'
import { QUOTE_PREVIEW_CHARS } from './ComposerQuotes.constants'
import styles from './ComposerQuotes.module.scss'
import type { ComposerQuotesProps } from './ComposerQuotes.types'

/**
 * Цитаты над полем (как в ACC): «REF n “…” from output ×». Уйдут в начале следующего
 * сообщения строками «> », сверху над словами - там, где их и читает модель. Сюда их
 * кладёт форк из выделения в ленте.
 */
export const ComposerQuotes = ({ draftKey }: ComposerQuotesProps) => {
  const { t } = useTranslation()
  const draft = useComposerStore((store) => store.drafts[draftKey] ?? EMPTY_DRAFT)
  const setDraft = useComposerStore((store) => store.setDraft)

  if (draft.quotes.length === 0) return null

  const handleRemove = (id: string) => () =>
    setDraft(draftKey, { ...draft, quotes: draft.quotes.filter((quote) => quote.id !== id) })

  return (
    <div className={styles.composerQuotes}>
      {draft.quotes.map((quote, index) => (
        <div key={quote.id} className={styles.quote}>
          <span className={styles.label}>{t('claudeCode.quotes.ref', { number: index + 1 })}</span>
          <span className={styles.text}>
            {t('claudeCode.quotes.text', {
              text:
                quote.text.length > QUOTE_PREVIEW_CHARS
                  ? `${quote.text.slice(0, QUOTE_PREVIEW_CHARS)}…`
                  : quote.text,
            })}
          </span>
          <span className={styles.source}>{t('claudeCode.quotes.fromOutput')}</span>
          <IconButton
            icon={X}
            size="sm"
            label={t('claudeCode.quotes.remove')}
            onClick={handleRemove(quote.id)}
          />
        </div>
      ))}
    </div>
  )
}

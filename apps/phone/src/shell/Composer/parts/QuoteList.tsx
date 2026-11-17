import { X, TextQuote } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../Composer.module.scss'
import { useDraftsStore } from '../../../state/drafts.store'

/**
 * Цитаты из ленты над полем, как в ACC: строкой, с чертой слева, крестик убирает. Уходят с
 * сообщением строками «> » сверху - так их пишет и поле IDE.
 */
export const QuoteList = ({ draftKey, quotes }: { draftKey: string; quotes: string[] }) => {
  const { t } = useTranslation()
  const removeQuote = useDraftsStore((state) => state.removeQuote)

  return (
    <ul className={styles.quotes} aria-label={t('composer.quotes')}>
      {quotes.map((quote, index) => (
        <li key={`${index}-${quote}`} className={styles.quote}>
          <TextQuote className={styles.quoteIcon} aria-hidden />
          <span className={styles.quoteText}>{quote}</span>
          <IconButton
            icon={X}
            size="touch"
            label={t('composer.removeQuote', { number: index + 1 })}
            onClick={() => removeQuote(draftKey, index)}
          />
        </li>
      ))}
    </ul>
  )
}

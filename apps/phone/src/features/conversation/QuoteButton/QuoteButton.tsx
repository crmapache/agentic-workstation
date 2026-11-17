import clsx from 'clsx'
import { TextQuote } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from './QuoteButton.module.scss'
import type { QuotableSelection } from './QuoteButton.types'

/**
 * Кнопка «Quote» над лентой, пока в ответе модели выделен текст, - как в ACC. Своя полоса
 * системы (копировать, поделиться) стоит у самого выделения, эта - у края ленты.
 */
export const QuoteButton = ({
  selection,
  onHold,
  onQuote,
}: {
  selection: QuotableSelection | null
  onHold: () => void
  onQuote: () => void
}) => {
  const { t } = useTranslation()

  if (!selection) return null

  return (
    <span className={clsx(styles.quoteButton, styles[selection.placement])}>
      <Button
        size="touch"
        variant="secondary"
        icon={TextQuote}
        onPointerDown={onHold}
        onClick={onQuote}>
        {t('composer.quote')}
      </Button>
    </span>
  )
}

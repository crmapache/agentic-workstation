import clsx from 'clsx'
import { Copy, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../Markdown.module.scss'
import type { MarkdownQuoteProps } from '../Markdown.types'
import { clipboardText } from '../Markdown.utils'
import { useCopy } from '../../../../lib/clipboard.hooks'
import { MarkdownBlocks } from './MarkdownBlocks'

/**
 * Цитата. Ей модель отдаёт текст, который человек понесёт дальше (письмо, сообщение коллеге), -
 * поэтому у неё, как у блока кода, копия в углу: по наведению, текст первых строк её обтекает.
 * В буфер уходит текст без «>» и без звёздочек жирного.
 */
export const MarkdownQuote = ({ quote }: MarkdownQuoteProps) => {
  const { t } = useTranslation()
  const { isCopied, copy } = useCopy()

  return (
    <blockquote className={styles.quote}>
      <span className={clsx(styles.quoteCopy, isCopied && styles.quoteCopied)}>
        <IconButton
          icon={isCopied ? Check : Copy}
          size="sm"
          label={isCopied ? t('agentPanel.markdown.copied') : t('agentPanel.markdown.copyBlock')}
          onClick={() => copy(clipboardText(quote.text))}
        />
      </span>
      <MarkdownBlocks tokens={quote.tokens} />
    </blockquote>
  )
}

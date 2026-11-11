import { Copy, Check } from 'lucide-react'

import { IconButton } from '../IconButton/IconButton'
import { useCopied } from './CodeSnippet.hooks'
import styles from './CodeSnippet.module.scss'
import type { CodeSnippetProps } from './CodeSnippet.types'
import { splitWords } from './CodeSnippet.utils'

/**
 * Строка кода, которую копируют: команда сервера, адрес возврата для чужих настроек.
 * Моноширинный текст на тёмной подложке, кнопка копии справа видна всегда. Длинное
 * переносится по пробелам, а слово длиннее строки - внутри себя. Код из ответа модели с
 * подсветкой - блок кода панели Claude Code, не этот.
 */
export const CodeSnippet = ({ code, copyLabel, copiedLabel }: CodeSnippetProps) => {
  const { isCopied, copy } = useCopied()

  return (
    <div className={styles.snippet}>
      <code className={styles.code}>
        {splitWords(code).map((part, index) =>
          part.trim() ? (
            <span key={index} className={styles.word}>
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </code>
      <IconButton
        icon={isCopied ? Check : Copy}
        size="sm"
        label={isCopied ? copiedLabel : copyLabel}
        onClick={() => copy(code)}
      />
    </div>
  )
}

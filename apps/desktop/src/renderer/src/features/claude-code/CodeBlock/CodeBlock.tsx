import { memo } from 'react'
import clsx from 'clsx'
import { Copy, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useCopy } from '../clipboard.hooks'
import { useCodeRuns } from './CodeBlock.hooks'
import styles from './CodeBlock.module.scss'
import type { CodeBlockProps } from './CodeBlock.types'
import { CodeRuns } from './parts/CodeRuns'

/**
 * Блок кода в ответе (и команда установки CLI), как в ACC: без шапки, копия - кнопкой в
 * углу (видна по наведению). Подсветка ролями `--color-syntax-*`, язык неизвестен - код
 * ровным цветом. Пути к файлам внутри кода - ссылки, и при подсветке тоже.
 */
export const CodeBlock = memo(
  ({ code, language = '', compact = false, wrap = false }: CodeBlockProps) => {
    const { t } = useTranslation()
    const { isCopied, copy } = useCopy()
    const lines = useCodeRuns(code, language)

    const handleCopy = () => copy(code)

    return (
      <div className={clsx(styles.codeBlock, compact && styles.compact, wrap && styles.wrap)}>
        <pre className={styles.pre}>
          <code className={styles.code}>
            {lines.map((runs, index) => (
              <span key={index} className={styles.line}>
                <CodeRuns runs={runs} />
              </span>
            ))}
          </code>
        </pre>
        <div className={clsx(styles.copy, isCopied && styles.copied)}>
          <IconButton
            icon={isCopied ? Check : Copy}
            size="sm"
            label={isCopied ? t('claudeCode.markdown.copied') : t('claudeCode.markdown.copyBlock')}
            onClick={handleCopy}
          />
        </div>
      </div>
    )
  },
)

CodeBlock.displayName = 'CodeBlock'

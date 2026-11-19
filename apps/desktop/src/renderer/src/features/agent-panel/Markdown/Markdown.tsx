import { memo, useMemo } from 'react'

import { lexMarkdown } from '../markdown-lexer'
import { MarkdownLinksContext } from './Markdown.context'
import styles from './Markdown.module.scss'
import type { MarkdownProps } from './Markdown.types'
import { MarkdownBlocks } from './parts/MarkdownBlocks'

/**
 * Текст в разметке Markdown: ответ модели, план, отчёт субагента. Разбор - marked со
 * своими заборами кода (правило ACC) и формулами, отрисовка - свои React-элементы, без
 * innerHTML: HTML из ответа показывается текстом, ссылки открываются в браузере, пути -
 * в IDE.
 */
export const Markdown = memo(({ text }: MarkdownProps) => {
  const tokens = useMemo(() => lexMarkdown(text), [text])
  const links = Object.keys(tokens.links).join('\n')

  return (
    <MarkdownLinksContext value={links}>
      <div className={styles.markdown}>
        <MarkdownBlocks tokens={tokens} />
      </div>
    </MarkdownLinksContext>
  )
})

Markdown.displayName = 'Markdown'

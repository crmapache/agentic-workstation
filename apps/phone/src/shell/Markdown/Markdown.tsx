import { memo, useMemo } from 'react'

import styles from './Markdown.module.scss'
import { lexMarkdown } from './Markdown.utils'
import { MarkdownBlocks } from './parts/MarkdownBlocks'

/**
 * Текст в разметке Markdown: ответ модели, план, слова головы сценария. Разбор - лексер marked,
 * отрисовка - свои React-элементы, без innerHTML: HTML из ответа показывается текстом, ссылки -
 * только http, https и почта, картинки по сети не грузятся (вместо них - ссылка).
 */
export const Markdown = memo(({ text }: { text: string }) => {
  const tokens = useMemo(() => lexMarkdown(text), [text])

  return (
    <div className={styles.markdown}>
      <MarkdownBlocks tokens={tokens} />
    </div>
  )
})

Markdown.displayName = 'Markdown'

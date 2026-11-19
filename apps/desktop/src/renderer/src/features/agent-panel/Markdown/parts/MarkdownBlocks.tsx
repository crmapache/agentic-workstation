import { use, memo } from 'react'
import type { Tokens } from 'marked'

import { HEADING_CLASS } from '../Markdown.constants'
import { MarkdownLinksContext } from '../Markdown.context'
import styles from '../Markdown.module.scss'
import type { MathToken, MarkdownTokenProps, MarkdownTokensProps } from '../Markdown.types'
import { codeLanguage } from '../Markdown.utils'
import { CodeBlock } from '../../CodeBlock/CodeBlock'
import { Formula } from '../../Formula/Formula'
import { MarkdownInline } from './MarkdownInline'
import { MarkdownList } from './MarkdownList'
import { MarkdownTable } from './MarkdownTable'

/** Один блок разметки: абзац, заголовок, код, формула, список, цитата, таблица. */
const Block = ({ token }: MarkdownTokenProps) => {
  // Подписка на сноски: дописалось определение - блок перерисуется, хоть raw и тот же.
  use(MarkdownLinksContext)

  switch (token.type) {
    case 'paragraph':
      return (
        <p className={styles.paragraph}>
          <MarkdownInline tokens={(token as Tokens.Paragraph).tokens} />
        </p>
      )
    case 'heading': {
      const heading = token as Tokens.Heading

      return (
        <div
          role="heading"
          aria-level={heading.depth}
          className={styles[HEADING_CLASS[heading.depth] ?? 'h4']}>
          <MarkdownInline tokens={heading.tokens} />
        </div>
      )
    }
    case 'code': {
      const code = token as Tokens.Code

      return <CodeBlock code={code.text} language={codeLanguage(code.lang)} />
    }
    case 'math':
      return <Formula latex={(token as MathToken).text} display />
    case 'blockquote':
      return (
        <blockquote className={styles.quote}>
          <MarkdownBlocks tokens={(token as Tokens.Blockquote).tokens} />
        </blockquote>
      )
    case 'list':
      return <MarkdownList list={token as Tokens.List} />
    case 'table':
      return <MarkdownTable table={token as Tokens.Table} />
    case 'hr':
      return <hr className={styles.rule} />
    case 'text': {
      const text = token as Tokens.Text

      return (
        <p className={styles.paragraph}>
          {text.tokens ? <MarkdownInline tokens={text.tokens} /> : text.text}
        </p>
      )
    }
    case 'html':
      // HTML в ответе - текст, а не разметка: окно не исполняет то, что прислала модель.
      return <p className={styles.paragraph}>{(token as Tokens.HTML).text}</p>
    default:
      return null
  }
}

/**
 * Блок перерисовывается, только когда поменялся его исходный текст или сноски
 * документа: при потоке лексер каждый раз отдаёт новые объекты, а дописывается лишь
 * последний блок.
 */
const StableBlock = memo(Block, (previous, next) => previous.token.raw === next.token.raw)

/** Блоки разметки по порядку. Пустые строки между блоками отступами не дублируются. */
export const MarkdownBlocks = ({ tokens }: MarkdownTokensProps) => (
  <>
    {tokens.map((token, index) =>
      token.type === 'space' ? null : <StableBlock key={index} token={token} />,
    )}
  </>
)

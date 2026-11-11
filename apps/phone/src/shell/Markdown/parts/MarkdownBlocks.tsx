import type { Token, Tokens } from 'marked'

import styles from '../Markdown.module.scss'
import { listMarker, codeLanguage } from '../Markdown.utils'
import { CodeBlock } from './CodeBlock'
import { MarkdownInline } from './MarkdownInline'

const Heading = ({ token }: { token: Tokens.Heading }) => {
  const Tag = token.depth <= 2 ? 'h3' : 'h4'

  return (
    <Tag className={token.depth <= 2 ? styles.headingLarge : styles.heading}>
      <MarkdownInline tokens={token.tokens} />
    </Tag>
  )
}

const List = ({ token }: { token: Tokens.List }) => (
  <ul className={styles.list}>
    {token.items.map((item, index) => (
      <li key={index} className={styles.listItem}>
        <span className={styles.marker}>
          {item.task ? (item.checked ? '☑' : '☐') : listMarker(token, item, index)}
        </span>
        <div className={styles.listBody}>
          <MarkdownBlocks tokens={item.tokens} />
        </div>
      </li>
    ))}
  </ul>
)

const Table = ({ token }: { token: Tokens.Table }) => (
  <div className={styles.tableWrap}>
    <table className={styles.table}>
      <thead>
        <tr>
          {token.header.map((cell, index) => (
            <th key={index}>
              <MarkdownInline tokens={cell.tokens} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {token.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, index) => (
              <td key={index}>
                <MarkdownInline tokens={cell.tokens} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

const Block = ({ token }: { token: Token }) => {
  switch (token.type) {
    case 'heading':
      return <Heading token={token as Tokens.Heading} />
    case 'paragraph':
      return (
        <p className={styles.paragraph}>
          <MarkdownInline tokens={(token as Tokens.Paragraph).tokens} />
        </p>
      )
    case 'code': {
      const code = token as Tokens.Code

      return <CodeBlock code={code.text} language={codeLanguage(code.lang)} />
    }
    case 'blockquote':
      return (
        <blockquote className={styles.quote}>
          <MarkdownBlocks tokens={(token as Tokens.Blockquote).tokens} />
        </blockquote>
      )
    case 'list':
      return <List token={token as Tokens.List} />
    case 'table':
      return <Table token={token as Tokens.Table} />
    case 'hr':
      return <hr className={styles.rule} />
    case 'space':
      return null
    case 'text': {
      const text = token as Tokens.Text

      return (
        <p className={styles.paragraph}>
          {text.tokens ? <MarkdownInline tokens={text.tokens} /> : text.text}
        </p>
      )
    }
    default:
      // HTML и незнакомое - как есть, текстом: разметка из ответа модели не исполняется.
      return <p className={styles.paragraph}>{'raw' in token ? token.raw : ''}</p>
  }
}

/** Блоки текста по порядку: абзацы, заголовки, списки, код, цитаты, таблицы. */
export const MarkdownBlocks = ({ tokens }: { tokens: Token[] }) => (
  <>
    {tokens.map((token, index) => (
      <Block key={index} token={token} />
    ))}
  </>
)

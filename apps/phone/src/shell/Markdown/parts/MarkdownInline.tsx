import type { Token, Tokens } from 'marked'

import styles from '../Markdown.module.scss'
import { safeHref, inlineTokens } from '../Markdown.utils'

const Inline = ({ token }: { token: Token }) => {
  switch (token.type) {
    case 'strong':
      return (
        <strong className={styles.strong}>
          <MarkdownInline tokens={inlineTokens(token)} />
        </strong>
      )
    case 'em':
      return (
        <em>
          <MarkdownInline tokens={inlineTokens(token)} />
        </em>
      )
    case 'del':
      return (
        <del>
          <MarkdownInline tokens={inlineTokens(token)} />
        </del>
      )
    case 'codespan':
      return <code className={styles.inlineCode}>{(token as Tokens.Codespan).text}</code>
    case 'br':
      return <br />
    case 'link': {
      const link = token as Tokens.Link
      const href = safeHref(link.href)

      return href ? (
        <a className={styles.link} href={href} target="_blank" rel="noopener noreferrer">
          <MarkdownInline tokens={link.tokens} />
        </a>
      ) : (
        <MarkdownInline tokens={link.tokens} />
      )
    }
    case 'image': {
      // Картинку по сети телефон не грузит: чужой адрес узнал бы, что разговор открыт.
      const image = token as Tokens.Image
      const href = safeHref(image.href)

      return href ? (
        <a className={styles.link} href={href} target="_blank" rel="noopener noreferrer">
          {image.text || href}
        </a>
      ) : (
        image.text
      )
    }
    case 'text': {
      const text = token as Tokens.Text

      return text.tokens ? <MarkdownInline tokens={text.tokens} /> : text.text
    }
    case 'escape':
      return (token as Tokens.Escape).text
    default:
      return 'raw' in token ? token.raw : null
  }
}

/** Строка текста: жирный, курсив, код, ссылки. HTML - текстом. */
export const MarkdownInline = ({ tokens }: { tokens: Token[] }) => (
  <>
    {tokens.map((token, index) => (
      <Inline key={index} token={token} />
    ))}
  </>
)

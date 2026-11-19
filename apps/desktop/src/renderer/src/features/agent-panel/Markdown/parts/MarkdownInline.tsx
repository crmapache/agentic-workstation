import type { Tokens } from 'marked'

import { OPENABLE_LINK } from '../Markdown.constants'
import styles from '../Markdown.module.scss'
import type { MathToken, MarkdownInlineProps, MarkdownInlineTokenProps } from '../Markdown.types'
import { Formula } from '../../Formula/Formula'
import { LinkedText } from '../../LinkedText/LinkedText'
import { RevealText } from '../../RevealText/RevealText'
import { InlineCode } from './InlineCode'

/** Один кусок строки: жирный, курсив, код, формула, ссылка, текст. */
const Inline = ({ token, plain }: MarkdownInlineTokenProps) => {
  switch (token.type) {
    case 'strong':
      return (
        <strong className={styles.strong}>
          <MarkdownInline tokens={(token as Tokens.Strong).tokens} plain={plain} />
        </strong>
      )
    case 'em':
      return (
        <em>
          <MarkdownInline tokens={(token as Tokens.Em).tokens} plain={plain} />
        </em>
      )
    case 'del':
      return (
        <del className={styles.deleted}>
          <MarkdownInline tokens={(token as Tokens.Del).tokens} plain={plain} />
        </del>
      )
    case 'codespan': {
      const text = (token as Tokens.Codespan).text

      return plain ? <code className={styles.inlineCode}>{text}</code> : <InlineCode text={text} />
    }
    case 'math':
      return <Formula latex={(token as MathToken).text} display={false} />
    case 'link': {
      const link = token as Tokens.Link
      const content = <MarkdownInline tokens={link.tokens} plain />

      // Ссылка на сайт открывается в браузере (обработчик окна в главном процессе),
      // остальные схемы - просто текст.
      return OPENABLE_LINK.test(link.href) ? (
        <a className={styles.link} href={link.href} target="_blank" rel="noreferrer">
          {content}
        </a>
      ) : (
        content
      )
    }
    case 'image':
      // Картинки из сети окно не грузит (CSP) - показывается подпись.
      return <span className={styles.deleted}>{(token as Tokens.Image).text}</span>
    case 'br':
      return <br />
    case 'text': {
      const text = token as Tokens.Text

      if (text.tokens) return <MarkdownInline tokens={text.tokens} plain={plain} />

      // Пути в обычном тексте - ссылки: агент пишет их без бэктиков чаще, чем с ними.
      return plain ? <RevealText>{text.text}</RevealText> : <LinkedText text={text.text} />
    }
    case 'escape':
    case 'html':
      return (token as Tokens.Escape | Tokens.HTML).text
    default:
      return 'text' in token && typeof token.text === 'string' ? token.text : null
  }
}

/** Строка разметки: куски по порядку. */
export const MarkdownInline = ({ tokens, plain = false }: MarkdownInlineProps) => (
  <>
    {tokens.map((token, index) => (
      <Inline key={index} token={token} plain={plain} />
    ))}
  </>
)

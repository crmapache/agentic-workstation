import styles from '../Markdown.module.scss'
import { PathText } from '../../PathText/PathText'
import { CopyButton } from './CopyButton'

/**
 * Блок кода: моноширинный, прокрутка вбок внутри блока. В шапке - язык слева и копия справа:
 * команду из ответа несут в терминал целиком, а выделять пальцем код, который шире экрана,
 * мучительно.
 */
export const CodeBlock = ({ code, language }: { code: string; language: string }) => (
  <figure className={styles.code}>
    <figcaption className={styles.codeHead}>
      <span className={styles.codeLanguage}>{language}</span>
      <CopyButton text={code} />
    </figcaption>
    <pre className={styles.pre}>
      <code>
        <PathText text={code} />
      </code>
    </pre>
  </figure>
)

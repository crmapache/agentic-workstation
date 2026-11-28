import clsx from 'clsx'

import styles from '../Markdown.module.scss'
import { PathText } from '../../PathText/PathText'
import { CopyButton } from './CopyButton'

/**
 * Блок кода: моноширинный, прокрутка вбок внутри блока. В шапке - язык слева и копия справа:
 * команду из ответа несут в терминал целиком, а выделять пальцем код, который шире экрана,
 * мучительно. Текст для копирования (prose: письмо, сообщение) переносится по словам и виден
 * целиком; копия берёт его как есть.
 */
export const CodeBlock = ({
  code,
  language,
  prose = false,
}: {
  code: string
  language: string
  prose?: boolean
}) => (
  <figure className={styles.code}>
    <figcaption className={styles.codeHead}>
      <span className={styles.codeLanguage}>{language}</span>
      <CopyButton text={code} />
    </figcaption>
    <pre className={clsx(styles.pre, prose && styles.prose)}>
      <code>
        <PathText text={code} />
      </code>
    </pre>
  </figure>
)

import styles from '../Markdown.module.scss'

/** Блок кода: моноширинный, прокрутка вбок внутри блока, язык подписью сверху. */
export const CodeBlock = ({ code, language }: { code: string; language: string }) => (
  <figure className={styles.code}>
    {language && <figcaption className={styles.codeLanguage}>{language}</figcaption>}
    <pre className={styles.pre}>
      <code>{code}</code>
    </pre>
  </figure>
)

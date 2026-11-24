import styles from '../EventCard.module.scss'
import type { LinkTextProps } from '../EventCard.types'

/** Текст, который ссылкой, если ссылка есть: имя человека, место, вложение. */
export const LinkText = ({ text, url }: LinkTextProps) =>
  url ? (
    <a className={styles.link} href={url} target="_blank" rel="noreferrer">
      {text}
    </a>
  ) : (
    <span>{text}</span>
  )

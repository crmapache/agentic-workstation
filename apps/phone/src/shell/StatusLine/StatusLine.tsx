import type { ReactNode } from 'react'

import styles from './StatusLine.module.scss'

/**
 * Строка под заголовком экрана: метка состояния и за ней остальное через « · ». Метка не
 * сжимается, остальное обрезается многоточием - метка не сливается с текстом и не уезжает.
 */
export const StatusLine = ({ badge, text }: { badge: ReactNode; text?: string | undefined }) => (
  <>
    <span className={styles.badge}>{badge}</span>
    {text && <span className={styles.text}>{text}</span>}
  </>
)

import type { ReactNode } from 'react'

import styles from './ListGroup.module.scss'

/** Плитка со строками под палец (ListRow): разговоры, очереди, проекты одной IDE. */
export const ListGroup = ({ label, children }: { label: string; children: ReactNode }) => (
  <div role="list" aria-label={label} className={styles.group}>
    {children}
  </div>
)

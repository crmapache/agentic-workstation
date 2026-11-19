import styles from '../NoticeRow.module.scss'
import type { CheckpointRowProps } from '../NoticeRow.types'

/**
 * Отметка в разговоре, как в ACC: чип, подпись и пунктир до края - граница («conversation
 * cleared», «rewound to here», шов форка), а не событие. С onClick - вся строка кнопка.
 */
export const CheckpointRow = ({ chip, children, onClick }: CheckpointRowProps) => {
  const body = (
    <>
      <span className={styles.checkpointChip}>{chip}</span>
      <span className={styles.checkpointText}>{children}</span>
      <span className={styles.dashed} />
    </>
  )

  return onClick ? (
    <button type="button" className={styles.checkpointButton} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={styles.checkpoint}>{body}</div>
  )
}

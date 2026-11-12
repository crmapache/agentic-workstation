import { splitPlaceholders } from '@agentic-workstation/remote-protocol/placeholders'

import styles from './PathText.module.scss'

/**
 * Текст с метками папок машины ({project}, {worktree}, ~): метки - как есть, приглушённо. Это
 * не часть пути, а знак, что на этом месте папка, которую IDE на телефон не отдаёт.
 */
export const PathText = ({ text }: { text: string }) => (
  <>
    {splitPlaceholders(text).map((piece, index) =>
      piece.placeholder ? (
        <span key={index} className={styles.placeholder}>
          {piece.text}
        </span>
      ) : (
        piece.text
      ),
    )}
  </>
)

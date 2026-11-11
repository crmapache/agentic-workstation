import clsx from 'clsx'

import { FileIcon } from '@agentic-workstation/ui/FileIcon'

import { splitPath } from '../../../lib/path.utils'
import styles from './PathTitle.module.scss'
import type { PathTitleProps } from './PathTitle.types'

/**
 * Чей вид в панели над разницей и историей: иконка типа, имя (цветом вида изменения) и папка
 * над ним - длинная теряет начало, а не ближнюю к файлу. Занимает остаток ряда панели.
 */
export const PathTitle = ({ path, kind, tone, children }: PathTitleProps) => {
  const { folder, name } = splitPath(path)

  return (
    <span className={styles.pathTitle}>
      <FileIcon path={path} kind={kind} size="sm" />
      <span className={clsx(styles.name, tone && styles[tone])}>{name}</span>
      {folder && (
        <span className={styles.folder}>
          <span className={styles.folderText}>{folder}</span>
        </span>
      )}
      {children}
    </span>
  )
}

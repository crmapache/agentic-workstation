import { FolderX, FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { FileTreeNode } from '../FileTreeNode'
import styles from '../FileTreeNode.module.scss'
import type { DirectoryChildrenProps } from '../FileTreeNode.types'
import { depthStyle } from '../FileTreeNode.utils'
import { useDirectory } from '../../file-tree.queries'

/**
 * Содержимое раскрытой папки. Читается с диска только когда папку раскрыли. В корне без папок
 * строки встают к краю панели, без столбца стрелок.
 * Пустая папка и ошибка чтения показываются строкой на месте содержимого - под именами
 * файлов, как они встали бы. У корня строк над ней нет, и такая строка висела бы со
 * сдвигом посреди пустой панели: там - пустое состояние на всю панель. Ошибка
 * перечитывания при прочитанном раньше содержимом - не повод его прятать: так бывает,
 * когда папку удалили и строка вот-вот пропадёт вместе с ней. Кроме корня: его строки
 * нет, и пропасть вместе с ней он не может.
 */
export const DirectoryChildren = ({ projectId, relativePath, depth }: DirectoryChildrenProps) => {
  const { t } = useTranslation()
  const { data, isError } = useDirectory(projectId, relativePath)

  // У корня строки над ним нет: пропал сам проект (удалили, отключили диск) - сказать.
  const showError = isError && (!data || relativePath === '')

  if ((showError || data?.length === 0) && relativePath === '') {
    return (
      <EmptyState
        icon={showError ? FolderX : FolderOpen}
        title={t(showError ? 'fileTree.rootErrorTitle' : 'fileTree.emptyProjectTitle')}
        description={t(showError ? 'fileTree.readError' : 'fileTree.emptyProjectText')}
      />
    )
  }

  if (showError || data?.length === 0) {
    return (
      // eslint-disable-next-line no-restricted-syntax -- отступ зависит от глубины
      <div className={styles.note} style={depthStyle(depth)}>
        {showError ? t('fileTree.readError') : t('fileTree.emptyFolder')}
      </div>
    )
  }

  // В корне без единой папки раскрывать нечего - файлы встают к краю. Глубже место стрелки
  // остаётся: иконки файлов идут ступенькой под иконкой своей папки.
  const flat = relativePath === '' && !data?.some((entry) => entry.kind === 'directory')

  return data?.map((entry) => (
    <FileTreeNode
      key={entry.relativePath}
      projectId={projectId}
      entry={entry}
      depth={depth}
      flat={flat}
    />
  ))
}

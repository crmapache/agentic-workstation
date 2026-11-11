import { FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { DirectoryChildren } from '../FileTreeNode/parts/DirectoryChildren'
import { useActiveProject } from '../../../state/workspace.queries'
import styles from './FileTreeView.module.scss'

/** Вид «Файлы» левой панели: дерево активного проекта, раскрывается по уровню. */
export const FileTreeView = () => {
  const { t } = useTranslation()
  const project = useActiveProject()

  if (!project) {
    return (
      <EmptyState
        icon={FolderOpen}
        title={t('fileTree.noProjectTitle')}
        description={t('fileTree.noProjectText')}
      />
    )
  }

  return (
    <div className={styles.tree}>
      <DirectoryChildren key={project.id} projectId={project.id} relativePath="" depth={0} />
    </div>
  )
}

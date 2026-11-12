import { FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { useActiveProject } from '../../../state/workspace.queries'
import { ProjectTree } from './parts/ProjectTree'

/**
 * Вид «Файлы» левой панели: шапка с действиями (найти открытый файл, свернуть всё) и дерево
 * активного проекта с меню правой кнопки, как окно Project в WebStorm.
 */
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

  return <ProjectTree key={project.id} project={project} />
}

import { FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { useActiveProject } from '../../../state/workspace.queries'
import { ProjectChanges } from './parts/ProjectChanges'

/**
 * Вид «Changes» левой панели, как окно Commit в WebStorm: что поменялось в проекте с
 * последнего коммита. Нажатие по файлу показывает разницу в середине окна, двойное
 * нажатие и F4 - сам файл.
 */
export const ChangesView = () => {
  const { t } = useTranslation()
  const project = useActiveProject()

  if (!project) {
    return (
      <EmptyState
        icon={FolderOpen}
        title={t('changes.noProjectTitle')}
        description={t('changes.noProjectText')}
      />
    )
  }

  return <ProjectChanges key={project.id} projectId={project.id} />
}

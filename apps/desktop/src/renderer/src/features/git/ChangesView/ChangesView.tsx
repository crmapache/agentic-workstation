import { FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { PageHeader } from '@agentic-workstation/ui/PageHeader'

import { useActiveProject } from '../../../state/workspace.queries'
import styles from './ChangesView.module.scss'
import { ProjectChanges } from './parts/ProjectChanges'

/**
 * Вид «Changes» левой панели, как окно Commit в WebStorm: что поменялось в проекте с
 * последнего коммита. Нажатие по файлу показывает разницу в середине окна, двойное
 * нажатие и F4 - сам файл. Шапка - как у дерева файлов: линия под ней вровень с вкладками
 * редактора и не прыгает при смене вида панели.
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

  return (
    <div className={styles.view}>
      <PageHeader size="sm" title={t('sideViews.changes')} />
      <div className={styles.body}>
        <ProjectChanges key={project.id} projectId={project.id} />
      </div>
    </div>
  )
}

import { useTranslation } from 'react-i18next'

import { ProjectTab } from '../ProjectTab/ProjectTab'
import { NO_CALLS } from '../ProjectTab/ProjectTab.constants'
import { useWorkspace, useWorkspaceActions } from '../../../state/workspace.queries'
import styles from './ProjectTabs.module.scss'
import type { ProjectTabsProps } from './ProjectTabs.types'

/**
 * Строка вкладок открытых проектов под шапкой: вкладки делят ширину окна поровну.
 * Сама полоса стоит всегда, даже без проектов и до загрузки списка, - иначе первый
 * открытый проект сдвигал бы всё окно вниз. Открыть проект - переключатель в шапке. У
 * каждой вкладки - точки разговоров проекта, которые позвали человека (callsOf).
 */
export const ProjectTabs = ({ callsOf }: ProjectTabsProps) => {
  const { t } = useTranslation()
  const { data } = useWorkspace()
  const { closeProject, activateProject } = useWorkspaceActions()

  const projects = data?.projects ?? []

  return (
    <div className={styles.projectTabs}>
      {projects.length > 0 && (
        <div role="tablist" aria-label={t('projects.tabsLabel')} className={styles.tabList}>
          {projects.map((project) => (
            <ProjectTab
              key={project.id}
              project={project}
              isActive={project.id === data?.activeProjectId}
              calls={callsOf?.(project.rootPath) ?? NO_CALLS}
              onActivate={activateProject}
              onClose={closeProject}
            />
          ))}
        </div>
      )}
    </div>
  )
}

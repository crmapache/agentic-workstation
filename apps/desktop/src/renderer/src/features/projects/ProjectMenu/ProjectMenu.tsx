import { useTranslation } from 'react-i18next'

import { Avatar } from '@agentic-workstation/ui/Avatar'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'

import { PROJECT_ACTIONS } from '../project-actions.constants'
import { useProjectActionRunner } from '../project-actions.hooks'
import { displayPath } from '../../../lib/path.utils'
import { useAppInfo } from '../../../state/app-info.queries'
import { projectTone, projectInitials } from '../../../state/project-avatar.utils'
import { useWorkspace, useWorkspaceActions } from '../../../state/workspace.queries'

const projectAvatar = (name: string) => (
  <Avatar initials={projectInitials(name)} tone={projectTone(name)} />
)

/**
 * Меню проекта, как в WebStorm: создать, открыть, клонировать; открытые проекты (с
 * путём, текущий подсвечен) и недавние - закрытые раньше.
 */
export const ProjectMenu = () => {
  const { t } = useTranslation()
  const { data: workspace } = useWorkspace()
  const { data: appInfo } = useAppInfo()
  const { openRecentProject, activateProject } = useWorkspaceActions()
  const runAction = useProjectActionRunner()
  const projects = workspace?.projects ?? []
  const recentProjects = workspace?.recentProjects ?? []

  return (
    <Menu label={t('projects.menuLabel')} autoFocus>
      {PROJECT_ACTIONS.map(({ id, icon, labelKey }) => (
        <MenuItem key={id} icon={icon} label={t(labelKey)} onSelect={() => runAction(id)} />
      ))}

      {projects.length > 0 && <MenuSeparator />}
      {projects.length > 0 && (
        <MenuSection title={t('projects.openProjects')}>
          {projects.map((project) => (
            <MenuItem
              key={project.id}
              leading={projectAvatar(project.name)}
              label={project.name}
              description={displayPath(project.rootPath, appInfo?.homeDir)}
              current={project.id === workspace?.activeProjectId}
              onSelect={() => activateProject(project.id)}
            />
          ))}
        </MenuSection>
      )}

      {recentProjects.length > 0 && <MenuSeparator />}
      {recentProjects.length > 0 && (
        <MenuSection title={t('projects.recentProjects')}>
          {recentProjects.map((project) => (
            <MenuItem
              key={project.rootPath}
              leading={projectAvatar(project.name)}
              label={project.name}
              description={displayPath(project.rootPath, appInfo?.homeDir)}
              onSelect={() => openRecentProject(project.rootPath)}
            />
          ))}
        </MenuSection>
      )}
    </Menu>
  )
}

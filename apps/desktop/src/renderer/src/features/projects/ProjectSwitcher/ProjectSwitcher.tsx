import { useTranslation } from 'react-i18next'

import { Avatar } from '@agentic-workstation/ui/Avatar'
import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import { useProjectsStore } from '../projects.store'
import { CloneDialog } from '../CloneDialog/CloneDialog'
import { ProjectMenu } from '../ProjectMenu/ProjectMenu'
import { projectTone, projectInitials } from '../../../state/project-avatar.utils'
import { useActiveProject } from '../../../state/workspace.queries'

/**
 * Переключатель проекта в шапке, как в WebStorm: значок с инициалами и имя активного
 * проекта, по клику - меню проектов. Меню монтируется только открытым: так оно
 * каждый раз свежее и не держит память, пока закрыто.
 */
export const ProjectSwitcher = () => {
  const { t } = useTranslation()
  const project = useActiveProject()
  const popover = usePopover()
  const isCloneOpen = useProjectsStore((state) => state.isCloneOpen)
  const closeClone = useProjectsStore((state) => state.closeClone)

  const avatar = project && (
    <Avatar initials={projectInitials(project.name)} tone={projectTone(project.name)} />
  )

  return (
    <>
      <DropdownButton
        {...popover.triggerProps}
        label={project?.name ?? t('projects.noProject')}
        leading={avatar}
        menuLabel={t('projects.switcherLabel')}
      />
      <Popover {...popover.popoverProps} width="lg">
        {popover.isOpen && <ProjectMenu />}
      </Popover>
      <CloneDialog open={isCloneOpen} onClose={closeClone} />
    </>
  )
}

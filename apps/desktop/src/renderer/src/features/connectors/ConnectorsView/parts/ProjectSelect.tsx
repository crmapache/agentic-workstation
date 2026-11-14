import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { SelectField } from '@agentic-workstation/ui/SelectField'

import type { ProjectSelectProps } from '../ConnectorsView.types'

/**
 * Для какого проекта инструкции (ADR 0053): окно коннекторов общее на IDE, поэтому проект
 * выбирается явно, а не берётся молча из открытой вкладки. У каких проектов инструкции уже
 * есть - подписано в списке.
 */
export const ProjectSelect = ({ projects, value, said, onPick }: ProjectSelectProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const label = t('connectors.inProject.project')
  const chosen = projects.find((project) => project.rootPath === value)

  const handlePick = (projectPath: string) => {
    popover.close()
    onPick(projectPath)
  }

  return (
    <>
      <SelectField {...popover.triggerProps} label={label} value={chosen?.name ?? value} />
      <Popover {...popover.popoverProps} width="field">
        {popover.isOpen && (
          <Menu label={label} autoFocus>
            {projects.map((project) => (
              <MenuItem
                key={project.rootPath}
                label={project.name}
                description={
                  said.includes(project.rootPath) ? t('connectors.inProject.said') : undefined
                }
                selection="single"
                checked={project.rootPath === value}
                onSelect={() => handlePick(project.rootPath)}
              />
            ))}
          </Menu>
        )}
      </Popover>
    </>
  )
}

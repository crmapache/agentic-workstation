import { FolderX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { withProject } from '@shared/connector-availability'

import { Avatar } from '@agentic-workstation/ui/Avatar'
import { ToggleChip } from '@agentic-workstation/ui/ToggleChip'

import { FOLDER_ICON_SIZE } from '../ConnectorsView.constants'
import styles from '../ConnectorsView.module.scss'
import type { ProjectChipsProps } from '../ConnectorsView.types'
import { baseName } from '../../../../lib/path.utils'
import { useConnectorActions } from '../../../../state/connectors.queries'
import { projectTone, projectInitials } from '../../../../state/project-avatar.utils'

/**
 * Отмеченные проекты режима «только в отмеченных» - плашками со значком, как во вкладках;
 * путь - в подсказке. Папки, которых нет среди проектов, тоже здесь: их отметка действует,
 * и прятать её нельзя.
 */
export const ProjectChips = ({ connector, selected, projects }: ProjectChipsProps) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const known = projects.map((project) => project.rootPath)
  const others = selected.projects.filter((path) => !known.includes(path))

  const handleToggle = (path: string, on: boolean) =>
    actions.setAvailability(connector.id, withProject(selected, path, on))

  if (projects.length === 0 && others.length === 0) {
    return <p className={styles.hint}>{t('connectors.projects.empty')}</p>
  }

  return (
    <div className={styles.chips}>
      {projects.map((project) => (
        <ToggleChip
          key={project.rootPath}
          label={project.name}
          leading={
            <Avatar initials={projectInitials(project.name)} tone={projectTone(project.name)} />
          }
          hint={project.rootPath}
          pressed={selected.projects.includes(project.rootPath)}
          onChange={(on) => handleToggle(project.rootPath, on)}
        />
      ))}
      {others.map((path) => (
        <ToggleChip
          key={path}
          label={baseName(path)}
          leading={<FolderX size={FOLDER_ICON_SIZE} aria-hidden />}
          hint={t('connectors.projects.otherFolder', { path })}
          pressed
          onChange={(on) => handleToggle(path, on)}
        />
      ))}
    </div>
  )
}

import { useTranslation } from 'react-i18next'

import { ClosableTab } from '@agentic-workstation/ui/ClosableTab'

import type { ProjectTabProps } from './ProjectTab.types'

/**
 * Вкладка одного проекта в верхней полосе. Клик - переключиться, крестик или
 * средняя кнопка мыши - закрыть. Полный путь - в подсказке.
 */
export const ProjectTab = ({ project, isActive, onActivate, onClose }: ProjectTabProps) => {
  const { t } = useTranslation()

  return (
    <ClosableTab
      label={project.name}
      hint={project.rootPath}
      active={isActive}
      closeLabel={t('projects.close', { name: project.name })}
      onActivate={() => onActivate(project.id)}
      onClose={() => onClose(project.id)}
    />
  )
}

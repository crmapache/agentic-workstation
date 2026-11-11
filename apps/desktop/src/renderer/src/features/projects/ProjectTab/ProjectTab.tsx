import { useTranslation } from 'react-i18next'

import { ClosableTab } from '@agentic-workstation/ui/ClosableTab'

import type { ProjectTabProps } from './ProjectTab.types'
import { tabHint } from './ProjectTab.utils'
import { CallDots } from './parts/CallDots'

/**
 * Вкладка одного проекта в верхней полосе. Клик - переключиться, крестик или
 * средняя кнопка мыши - закрыть. Полный путь - в подсказке. Разговоры проекта, которые
 * позвали человека, - точками справа и строками в подсказке: со звуком из фонового проекта
 * сразу видно, откуда он.
 */
export const ProjectTab = ({ project, isActive, calls, onActivate, onClose }: ProjectTabProps) => {
  const { t } = useTranslation()

  return (
    <ClosableTab
      label={project.name}
      hint={tabHint(project.rootPath, calls)}
      active={isActive}
      closeLabel={t('projects.close', { name: project.name })}
      trailing={calls.length > 0 && <CallDots calls={calls} />}
      onActivate={() => onActivate(project.id)}
      onClose={() => onClose(project.id)}
    />
  )
}

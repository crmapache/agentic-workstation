import type { MouseEvent } from 'react'
import { useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { ClosableTab } from '@agentic-workstation/ui/ClosableTab'

import type { ProjectTabProps } from './ProjectTab.types'
import { tabHint } from './ProjectTab.utils'
import { CallDots } from './parts/CallDots'

/**
 * Вкладка одного проекта в верхней полосе. Клик - переключиться, крестик или
 * средняя кнопка мыши - закрыть, нажатие с движением - перетащить на другое место. Выбранная
 * сама встаёт в виду, если ряд листается. Полный путь - в подсказке. Разговоры проекта, которые
 * позвали человека, - точками справа и строками в подсказке: со звуком из фонового проекта
 * сразу видно, откуда он.
 */
export const ProjectTab = ({
  project,
  isActive,
  calls,
  lifted,
  offset,
  register,
  onPress,
  onActivate,
  onClose,
}: ProjectTabProps) => {
  const { t } = useTranslation()
  const tabRef = useRef<HTMLDivElement | null>(null)
  const { id } = project

  // Ряд вкладок листается вбок (узкое окно): выбранная - всегда в виду, откуда бы её ни
  // выбрали (шапка, сочетание клавиш).
  useEffect(() => {
    if (isActive) tabRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [isActive])

  const handleRef = useCallback(
    (node: HTMLDivElement | null) => {
      tabRef.current = node
      register(id, node)
    },
    [register, id],
  )

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => onPress(event, id)

  return (
    <ClosableTab
      ref={handleRef}
      label={project.name}
      hint={tabHint(project.rootPath, calls)}
      active={isActive}
      closeLabel={t('projects.close', { name: project.name })}
      trailing={calls.length > 0 && <CallDots calls={calls} />}
      lifted={lifted}
      offset={offset === null ? null : { x: offset, y: 0 }}
      onMouseDown={handleMouseDown}
      onActivate={() => onActivate(id)}
      onClose={() => onClose(id)}
    />
  )
}

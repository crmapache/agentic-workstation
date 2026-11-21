import type { MouseEvent } from 'react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { ClosableTab } from '@agentic-workstation/ui/ClosableTab'
import { openWhenReleased } from '@agentic-workstation/ui/Popover.utils'

import type { TrackerTabProps } from '../TrackerTabs.types'

/** Вкладка проекта трекера: не закрывается крестиком - проект уходит в архив из меню. */
export const TrackerTab = ({
  project,
  active,
  lifted,
  offset,
  register,
  onPress,
  onActivate,
  onMenu,
}: TrackerTabProps) => {
  const { t } = useTranslation()
  const { id } = project

  const handleRef = useCallback((node: HTMLDivElement | null) => register(id, node), [register, id])
  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()

    const anchor = event.currentTarget

    openWhenReleased(event.nativeEvent, () => onMenu(anchor, id))
  }

  return (
    <ClosableTab
      ref={handleRef}
      label={project.title}
      hint={project.description || project.title}
      active={active}
      closable={false}
      closeLabel={t('tracker.tabs.archive')}
      width="fit"
      lifted={lifted}
      offset={offset === null ? null : { x: offset, y: 0 }}
      onMouseDown={(event) => onPress(event, id)}
      onContextMenu={handleContextMenu}
      onActivate={() => onActivate(id)}
      onClose={() => undefined}
    />
  )
}

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useTrackerActions } from '../tracker.actions'
import { useTrackerStore } from '../tracker.store'
import { useTabDrag } from '../../../lib/tab-drag.hooks'
import { useWheelToSide } from '../../../lib/wheel-to-side.hooks'
import styles from './TrackerTabs.module.scss'
import type { TrackerTabsProps } from './TrackerTabs.types'
import { TabMenu } from './parts/TabMenu'
import { TrackerTab } from './parts/TrackerTab'

/**
 * Проекты трекера вкладками в шапке вида: перетаскиваются так же, как вкладки проектов IDE,
 * правой кнопкой - переименовать, сдвинуть, убрать в архив. «+» в конце ряда - новый проект.
 */
export const TrackerTabs = ({ projects, activeId, onActivate }: TrackerTabsProps) => {
  const { t } = useTranslation()
  const { apply } = useTrackerActions()
  const edit = useTrackerStore((state) => state.edit)
  const attachWheel = useWheelToSide()
  const [menu, setMenu] = useState<{ anchor: HTMLElement; id: string } | null>(null)
  const ids = projects.map((project) => project.id)
  const drag = useTabDrag(ids, async (id, beforeId) => {
    const { board } = await apply({ kind: 'project.move', id, beforeId })

    return board ? board.projects.map((project) => project.id) : null
  })
  const { view } = drag

  return (
    <div className={styles.tabs}>
      {projects.length > 0 && (
        <div
          ref={attachWheel}
          role="tablist"
          aria-label={t('tracker.tabs.label')}
          className={styles.list}
          data-tab-row=""
          data-landing={drag.isLanding ? '' : undefined}>
          {projects.map((project) => (
            <TrackerTab
              key={project.id}
              project={project}
              active={project.id === activeId}
              lifted={view.draggedId === project.id}
              offset={
                view.draggedId === project.id ? view.offset : (view.shifts[project.id] ?? null)
              }
              register={drag.register}
              onPress={drag.onPress}
              onActivate={onActivate}
              onMenu={(anchor, id) => setMenu({ anchor, id })}
            />
          ))}
        </div>
      )}
      <IconButton
        icon={Plus}
        size="sm"
        label={t('tracker.tabs.new')}
        onClick={() => edit({ kind: 'project', id: null })}
      />
      {menu && (
        <TabMenu
          projectId={menu.id}
          anchor={menu.anchor}
          order={ids}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

import { Pencil, Archive, ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { useAnchoredPopover } from '@agentic-workstation/ui/Popover.hooks'

import type { TabMenuProps } from '../TrackerTabs.types'
import { useTrackerActions } from '../../tracker.actions'
import { useTrackerStore } from '../../tracker.store'

/**
 * Меню правой кнопки на вкладке проекта трекера: переименовать с описанием, сдвинуть на шаг,
 * убрать в архив (оттуда проект можно вернуть 30 дней).
 */
export const TabMenu = ({ projectId, anchor, order, onClose }: TabMenuProps) => {
  const { t } = useTranslation()
  const { id, ref, onToggle } = useAnchoredPopover(anchor, onClose)
  const { apply } = useTrackerActions()
  const edit = useTrackerStore((state) => state.edit)
  const index = order.indexOf(projectId)

  const run = (action: () => void) => {
    ref.current?.hidePopover()
    action()
  }
  // На шаг влево - перед соседом слева, вправо - перед тем, кто за соседом справа.
  const handleMove = (delta: -1 | 1) =>
    run(() => {
      const beforeId = delta < 0 ? (order[index - 1] ?? null) : (order[index + 2] ?? null)

      void apply({ kind: 'project.move', id: projectId, beforeId })
    })

  return (
    <Popover id={id} ref={ref} onToggle={onToggle}>
      <Menu label={t('tracker.tabs.menu')} autoFocus>
        <MenuItem
          icon={Pencil}
          label={t('tracker.tabs.edit')}
          onSelect={() => run(() => edit({ kind: 'project', id: projectId }))}
        />
        <MenuItem
          icon={ArrowLeft}
          label={t('tracker.tabs.moveLeft')}
          disabled={index <= 0}
          onSelect={() => handleMove(-1)}
        />
        <MenuItem
          icon={ArrowRight}
          label={t('tracker.tabs.moveRight')}
          disabled={index === order.length - 1}
          onSelect={() => handleMove(1)}
        />
        <MenuItem
          icon={Archive}
          iconTone="danger"
          label={t('tracker.tabs.archive')}
          onSelect={() => run(() => void apply({ kind: 'project.archive', id: projectId }))}
        />
      </Menu>
    </Popover>
  )
}

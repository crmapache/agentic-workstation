import { Trash2, ArrowUp, Ellipsis, ArrowDown, OctagonPause } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { QueueAction } from '@shared/scenario-queues'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import type { QueueItemMenuProps } from '../QueueCard.types'
import { useScenarioActions } from '../../scenarios.actions'

/**
 * Дела над ждущим сценарием: сдвинуть среди ждущих, остановить очередь после него, ждать ли
 * успеха предыдущего, убрать. «Чего ждать» - вариант с отметкой: меню не закрывается, видно,
 * что переключилось. Прошедшие и идущий не двигаются - их место уже случилось.
 */
export const QueueItemMenu = ({ queue, item, isFirst, isLast }: QueueItemMenuProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const actions = useScenarioActions()
  const isMarked = queue.stopAfterItemId === item.id
  const label = t('scenarios.queues.itemMenu.label', { name: item.scenarioName })

  const act = (action: QueueAction) => void actions.queue(queue.id, action)

  const handleUp = () => act({ kind: 'move', itemId: item.id, by: -1 })

  const handleDown = () => act({ kind: 'move', itemId: item.id, by: 1 })

  const handleStopAfter = () => act({ kind: 'stopAfter', itemId: isMarked ? null : item.id })

  const handleMode = () => act({ kind: 'mode', itemId: item.id, afterSuccess: !item.afterSuccess })

  const handleRemove = () => act({ kind: 'remove', itemId: item.id })

  return (
    <>
      <IconButton
        {...popover.triggerProps}
        icon={Ellipsis}
        size="xs"
        label={label}
        aria-haspopup="menu"
      />
      <Popover {...popover.popoverProps}>
        {popover.isOpen && (
          <Menu label={label} autoFocus>
            <MenuItem
              icon={ArrowUp}
              label={t('scenarios.queues.itemMenu.moveUp')}
              disabled={isFirst}
              onSelect={handleUp}
            />
            <MenuItem
              icon={ArrowDown}
              label={t('scenarios.queues.itemMenu.moveDown')}
              disabled={isLast}
              onSelect={handleDown}
            />
            <MenuSeparator />
            <MenuItem
              icon={OctagonPause}
              label={
                isMarked
                  ? t('scenarios.queues.itemMenu.keepGoing')
                  : t('scenarios.queues.itemMenu.stopAfter')
              }
              onSelect={handleStopAfter}
            />
            <MenuItem
              label={t('scenarios.queues.itemMenu.afterSuccess')}
              selection="multiple"
              checked={item.afterSuccess}
              onSelect={handleMode}
            />
            <MenuSeparator />
            <MenuItem
              icon={Trash2}
              label={t('scenarios.queues.itemMenu.remove')}
              onSelect={handleRemove}
            />
          </Menu>
        )}
      </Popover>
    </>
  )
}

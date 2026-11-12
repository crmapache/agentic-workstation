import { useState } from 'react'
import { Pencil, Trash2, Archive, Ellipsis, FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import type { QueueMenuProps } from '../QueueCard.types'
import { runningItemOf } from '../../scenarios-queues.utils'
import { useScenarioActions } from '../../scenarios.actions'
import { useScenariosStore } from '../../scenarios.store'
import { CloseQueueDialog } from './CloseQueueDialog'

/**
 * Меню очереди под «…»: переименовать, открыть worktree проектом, удалить worktree, закрыть.
 * Пока сценарий идёт, папку и очередь не трогают - пункты погашены с причиной: прогон писал бы
 * в удалённую папку.
 */
export const QueueMenu = ({ queue, onRename }: QueueMenuProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const actions = useScenarioActions()
  const open = useScenariosStore((state) => state.open)
  const [isClosing, setIsClosing] = useState(false)
  const isBusy = runningItemOf(queue) !== null
  const hasWorktree = queue.workdir.kind === 'worktree' && !queue.workdir.removed
  const busy = isBusy ? t('scenarios.queues.menu.busy') : undefined

  const handleOpenWorktree = () => void actions.worktree(queue.id, { kind: 'open' })

  const handleRemoveWorktree = () => open({ kind: 'worktreeRemove', queueId: queue.id })

  const handleClose = () => setIsClosing(true)

  const handleClosed = () => setIsClosing(false)

  return (
    <>
      <IconButton
        {...popover.triggerProps}
        icon={Ellipsis}
        size="sm"
        label={t('scenarios.queues.menu.label')}
        aria-haspopup="menu"
      />
      <Popover {...popover.popoverProps}>
        {popover.isOpen && (
          <Menu label={t('scenarios.queues.menu.label')} autoFocus>
            <MenuItem icon={Pencil} label={t('scenarios.queues.menu.rename')} onSelect={onRename} />
            {hasWorktree && (
              <>
                <MenuSeparator />
                <MenuItem
                  icon={FolderOpen}
                  label={t('scenarios.queues.menu.openWorktree')}
                  onSelect={handleOpenWorktree}
                />
                <MenuItem
                  icon={Trash2}
                  label={t('scenarios.queues.menu.removeWorktree')}
                  description={busy}
                  wrapDescription
                  disabled={isBusy}
                  onSelect={handleRemoveWorktree}
                />
              </>
            )}
            {queue.closedAt === 0 && <MenuSeparator />}
            {queue.closedAt === 0 && (
              <MenuItem
                icon={Archive}
                label={t('scenarios.queues.menu.close')}
                description={busy}
                wrapDescription
                disabled={isBusy}
                onSelect={handleClose}
              />
            )}
          </Menu>
        )}
      </Popover>
      {isClosing && <CloseQueueDialog queue={queue} onClose={handleClosed} />}
    </>
  )
}

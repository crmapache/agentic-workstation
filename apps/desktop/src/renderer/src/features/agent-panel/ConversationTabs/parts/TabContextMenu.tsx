import { Pin, Copy, Pencil, PinOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { useAnchoredPopover } from '@agentic-workstation/ui/Popover.hooks'

import type { TabContextMenuProps } from '../ConversationTabs.types'
import { useConversationActions } from '../../conversation-actions.hooks'
import { usePanelStore } from '../../panel.store'
import { useCopy } from '../../../../lib/clipboard.hooks'

/**
 * Меню правой кнопки на вкладке: скопировать ID разговора (для `claude --resume` в
 * терминале или чтобы передать его другой сессии), переименовать и закрепить или открепить
 * (с группой форков). Встаёт под вкладкой. У вкладки, где разговора ещё нет, копировать
 * нечего - пункта нет.
 */
export const TabContextMenu = ({ conversation, anchor, onClose }: TabContextMenuProps) => {
  const { t } = useTranslation()
  const { id, ref, onToggle } = useAnchoredPopover(anchor, onClose)
  const setNaming = usePanelStore((store) => store.setNaming)
  const { setPinned } = useConversationActions()
  const { copy } = useCopy()
  const isPinned = conversation?.pinned === true
  const hasSession =
    conversation !== null && (conversation.outcome !== 'none' || conversation.status !== 'idle')

  const handleCopy = () => {
    if (conversation) copy(conversation.sessionId)

    ref.current?.hidePopover()
  }

  // Сначала закрыть меню: закрытие возвращает фокус туда, где он был, а полю имени он
  // нужен после.
  const handleRename = () => {
    ref.current?.hidePopover()

    if (conversation) setNaming(conversation.id)
  }

  const handlePin = () => {
    ref.current?.hidePopover()

    if (conversation) void setPinned(conversation.id, !isPinned)
  }

  return (
    <Popover id={id} ref={ref} onToggle={onToggle}>
      {conversation && (
        <Menu label={t('agentPanel.tabs.menu.label')} autoFocus>
          {hasSession && (
            <MenuItem icon={Copy} label={t('agentPanel.tabs.menu.copyId')} onSelect={handleCopy} />
          )}
          <MenuItem
            icon={Pencil}
            label={t('agentPanel.tabs.menu.rename')}
            onSelect={handleRename}
          />
          <MenuItem
            icon={isPinned ? PinOff : Pin}
            label={isPinned ? t('agentPanel.tabs.menu.unpin') : t('agentPanel.tabs.menu.pin')}
            description={
              isPinned ? t('agentPanel.tabs.menu.unpinHint') : t('agentPanel.tabs.menu.pinHint')
            }
            onSelect={handlePin}
          />
        </Menu>
      )}
    </Popover>
  )
}

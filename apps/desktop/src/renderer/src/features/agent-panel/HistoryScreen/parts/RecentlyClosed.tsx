import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'

import type { RecentlyClosedProps } from '../HistoryScreen.types'
import { useConversationActions } from '../../conversation-actions.hooks'
import { keyLine } from '../../panel-keys.utils'
import { usePanelState } from '../../panel.queries'
import { usePanelStore } from '../../panel.store'
import { formatAgo } from '../../panel.utils'
import { tabName } from '../../ConversationTabs/ConversationTabs.utils'

/**
 * «Recently closed» сверху истории: вкладки, закрытые руками, последние первыми (до 20).
 * Выше прошлых разговоров, потому что это вкладки - с черновиком, моделью и местом на
 * полосе: выбор ставит вкладку туда, где она стояла. Клавиша возврата названа у первой
 * строки - её она и вернёт.
 */
export const RecentlyClosed = ({ project, needle, now }: RecentlyClosedProps) => {
  const { t } = useTranslation()
  const { reopenClosed } = useConversationActions()
  const closeMenu = usePanelStore((store) => store.closeMenu)
  const { data: state } = usePanelState()
  const closed = (state?.closedByProject[project.rootPath] ?? [])
    .map((tab) => ({ ...tab, name: tabName(tab, t) }))
    .filter((tab) => tab.name.toLowerCase().includes(needle))

  if (closed.length === 0) return null

  const handleReopen = (closedId: string) => {
    closeMenu()
    void reopenClosed(project.id, closedId)
  }

  return (
    <MenuSection title={t('agentPanel.tabs.recentlyClosed')}>
      {closed.map((tab, index) => (
        <MenuItem
          key={tab.id}
          icon={RotateCcw}
          label={tab.name}
          description={
            tab.depth > 0
              ? t('agentPanel.tabs.closedFork', { when: formatAgo(tab.closedAt, now) })
              : formatAgo(tab.closedAt, now)
          }
          hint={index === 0 && !needle ? keyLine('reopenTab') : undefined}
          onSelect={() => handleReopen(tab.id)}
        />
      ))}
    </MenuSection>
  )
}

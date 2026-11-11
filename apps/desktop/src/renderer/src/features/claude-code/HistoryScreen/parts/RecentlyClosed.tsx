import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'

import type { RecentlyClosedProps } from '../HistoryScreen.types'
import { useClaudeActions } from '../../claude-actions.hooks'
import { useClaudeCodeStore } from '../../claude-code.store'
import { useClaudeState } from '../../claude.queries'
import { formatAgo } from '../../claude.utils'
import { keyLine } from '../../panel-keys.utils'
import { tabName } from '../../ConversationTabs/ConversationTabs.utils'

/**
 * «Recently closed» сверху истории: вкладки, закрытые руками, последние первыми (до 20).
 * Выше прошлых разговоров, потому что это вкладки - с черновиком, моделью и местом на
 * полосе: выбор ставит вкладку туда, где она стояла. Клавиша возврата названа у первой
 * строки - её она и вернёт.
 */
export const RecentlyClosed = ({ project, needle, now }: RecentlyClosedProps) => {
  const { t } = useTranslation()
  const { reopenClosed } = useClaudeActions()
  const closeMenu = useClaudeCodeStore((store) => store.closeMenu)
  const { data: state } = useClaudeState()
  const closed = (state?.closedByProject[project.rootPath] ?? [])
    .map((tab) => ({ ...tab, name: tabName(tab, t) }))
    .filter((tab) => tab.name.toLowerCase().includes(needle))

  if (closed.length === 0) return null

  const handleReopen = (closedId: string) => {
    closeMenu()
    void reopenClosed(project.id, closedId)
  }

  return (
    <MenuSection title={t('claudeCode.tabs.recentlyClosed')}>
      {closed.map((tab, index) => (
        <MenuItem
          key={tab.id}
          icon={RotateCcw}
          label={tab.name}
          description={
            tab.depth > 0
              ? t('claudeCode.tabs.closedFork', { when: formatAgo(tab.closedAt, now) })
              : formatAgo(tab.closedAt, now)
          }
          hint={index === 0 && !needle ? keyLine('reopenTab') : undefined}
          onSelect={() => handleReopen(tab.id)}
        />
      ))}
    </MenuSection>
  )
}

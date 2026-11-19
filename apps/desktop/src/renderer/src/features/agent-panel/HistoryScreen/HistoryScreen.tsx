import { useState } from 'react'
import { Search, MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { HistoryEntry } from '@shared/conversation'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useConversationActions } from '../conversation-actions.hooks'
import { useConversationHistory } from '../panel.queries'
import { usePanelStore } from '../panel.store'
import type { MenuScreenProps } from '../panel.types'
import { isToday, formatAgo } from '../panel.utils'
import styles from './HistoryScreen.module.scss'
import { RecentlyClosed } from './parts/RecentlyClosed'

/**
 * Экран History бокового меню: сверху закрытые вкладки (вернуть на место), ниже прошлые
 * разговоры проекта из транскриптов CLI (туда пишут и разговоры из терминала), поиск по
 * заголовку, «сегодня» и «раньше». Открытый вкладкой разговор отмечен - выбор просто
 * переключит на него. Выбрал - меню закрылось.
 */
export const HistoryScreen = ({ project }: MenuScreenProps) => {
  const { t } = useTranslation()
  const { openHistory } = useConversationActions()
  const closeMenu = usePanelStore((store) => store.closeMenu)
  const { data: entries, isLoading } = useConversationHistory(project.id, true)
  const [query, setQuery] = useState('')
  const [now] = useState(() => Date.now())
  const needle = query.trim().toLowerCase()
  const found = (entries ?? []).filter((entry) => entry.title.toLowerCase().includes(needle))
  const today = found.filter((entry) => isToday(entry.updatedAt, now))
  const earlier = found.filter((entry) => !isToday(entry.updatedAt, now))

  const handleOpen = (entry: HistoryEntry) => {
    closeMenu()
    void openHistory(project.id, entry.sessionId)
  }

  const renderEntry = (entry: HistoryEntry) => (
    <MenuItem
      key={entry.sessionId}
      icon={MessageSquare}
      label={entry.title}
      description={formatAgo(entry.updatedAt, now)}
      current={entry.isOpen}
      onSelect={() => handleOpen(entry)}
    />
  )

  return (
    <Menu
      label={t('agentPanel.history')}
      autoFocus
      header={
        <TextField
          label={t('agentPanel.historySearch')}
          hideLabel
          icon={Search}
          placeholder={t('agentPanel.historySearch')}
          value={query}
          data-autofocus
          onChange={setQuery}
        />
      }>
      <RecentlyClosed project={project} needle={needle} now={now} />
      {today.length > 0 && (
        <MenuSection title={t('agentPanel.historyToday')}>{today.map(renderEntry)}</MenuSection>
      )}
      {earlier.length > 0 && (
        <MenuSection title={t('agentPanel.historyEarlier')}>{earlier.map(renderEntry)}</MenuSection>
      )}
      {!isLoading && found.length === 0 && (
        <div className={styles.empty}>
          {needle ? t('agentPanel.historyNothingFound') : t('agentPanel.historyEmpty')}
        </div>
      )}
    </Menu>
  )
}

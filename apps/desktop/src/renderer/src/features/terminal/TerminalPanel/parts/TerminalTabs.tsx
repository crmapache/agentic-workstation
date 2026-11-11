import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ClosableTab } from '@agentic-workstation/ui/ClosableTab'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../TerminalPanel.module.scss'
import type { TerminalTabsProps } from '../TerminalPanel.types'
import { tabTitle } from '../TerminalPanel.utils'

/** Вкладки оболочек проекта, «Local», «Local (2)»… и «+» за последней, как в WebStorm. */
export const TerminalTabs = ({ sessions, activeId, onPick, onClose, onAdd }: TerminalTabsProps) => {
  const { t } = useTranslation()

  return (
    <div className={styles.strip}>
      <div role="tablist" aria-label={t('terminal.tabs')} className={styles.tabList}>
        {sessions.map((session) => {
          const label = tabTitle(session.ordinal, t)

          return (
            <ClosableTab
              key={session.id}
              label={label}
              hint={label}
              active={session.id === activeId}
              width="fit"
              closeLabel={t('terminal.closeTab', { name: label })}
              onActivate={() => onPick(session.id)}
              onClose={() => onClose(session.id)}
            />
          )
        })}
      </div>
      <IconButton icon={Plus} label={t('terminal.newTab')} onClick={onAdd} />
    </div>
  )
}

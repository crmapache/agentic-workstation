import { Minus, SquareTerminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useTerminalActions, useTerminalSessions } from '../terminal.queries'
import { useTerminalStore } from '../terminal.store'
import { TerminalView } from '../TerminalView/TerminalView'
import { useActiveProject } from '../../../state/workspace.queries'
import { useTerminalLifecycle } from './TerminalPanel.hooks'
import styles from './TerminalPanel.module.scss'
import type { TerminalPanelProps } from './TerminalPanel.types'
import { activeSessionId } from './TerminalPanel.utils'
import { TerminalTabs } from './parts/TerminalTabs'

/**
 * Терминал под панелью Claude Code (ADR 0037), как окно Terminal в WebStorm: шапка с
 * вкладками оболочек открытого проекта, «+» и «спрятать», под ней - выбранная оболочка.
 * Оболочки всех проектов смонтированы и спрятаны: переключение проекта их не рвёт.
 */
export const TerminalPanel = ({ isOpen, onHide }: TerminalPanelProps) => {
  const { t } = useTranslation()
  const project = useActiveProject()
  const { data: all = [] } = useTerminalSessions()
  const { close } = useTerminalActions()
  const picked = useTerminalStore((store) => (project ? store.active[project.id] : undefined))
  const pick = useTerminalStore((store) => store.pick)
  const requestFocus = useTerminalStore((store) => store.requestFocus)
  const sessions = all.filter((session) => session.projectId === project?.id)
  const lifecycle = useTerminalLifecycle(project?.id ?? null, sessions, isOpen, onHide)
  const activeId = activeSessionId(sessions, picked)

  const handlePick = (sessionId: string) => {
    if (!project) return

    pick(project.id, sessionId)
    requestFocus()
  }

  const handleClose = (sessionId: string) => {
    close(sessionId).catch((error: unknown) => console.warn('[terminal] не закрылась:', error))
  }

  return (
    // data-terminal-panel - по нему ⌥F12 узнаёт, что человек уже в терминале.
    <section className={styles.terminalPanel} aria-label={t('terminal.title')} data-terminal-panel>
      <header className={styles.head}>
        <span className={styles.title}>{t('terminal.title')}</span>
        <TerminalTabs
          sessions={sessions}
          activeId={activeId}
          onPick={handlePick}
          onClose={handleClose}
          onAdd={lifecycle.add}
        />
        <IconButton icon={Minus} label={t('terminal.hide')} onClick={onHide} />
      </header>
      <div className={styles.body}>
        {all.map((session) => (
          <TerminalView
            key={session.id}
            sessionId={session.id}
            isActive={isOpen && session.id === activeId}
          />
        ))}
        {lifecycle.failed && sessions.length === 0 && (
          <div className={styles.notice}>
            <EmptyState
              icon={SquareTerminal}
              title={t('terminal.failed')}
              action={
                <Button variant="secondary" size="sm" onClick={lifecycle.add}>
                  {t('terminal.retry')}
                </Button>
              }
            />
          </div>
        )}
      </div>
    </section>
  )
}

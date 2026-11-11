import { RotateCw, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'

import { useClaudeActions } from '../claude-actions.hooks'
import { BLOCKED_VIEWS } from './ConversationBlocked.constants'
import styles from './ConversationBlocked.module.scss'
import type { ConversationBlockedProps } from './ConversationBlocked.types'

/**
 * Почему разговор не может начаться и что с этим сделать: довериться папке, вернуть
 * папку проекта, поставить CLI, попробовать снова после сбоя. Сообщение, которое не ушло, ждёт в очереди рядом и
 * уходит, как только причина снята.
 */
export const ConversationBlocked = ({ project, conversation, error }: ConversationBlockedProps) => {
  const { t } = useTranslation()
  const { trustProject, recheckCli, sendQueued } = useClaudeActions()
  const view = BLOCKED_VIEWS[error]
  const [waiting] = conversation.queue

  const handleTrust = () => void trustProject(project.id)

  const handleRecheck = () => void recheckCli()

  const handleRetry = () => {
    if (waiting) void sendQueued(conversation.id, waiting.id)
  }

  return (
    <div className={styles.conversationBlocked}>
      <Card
        tone={view.tone}
        icon={view.icon}
        title={t(view.titleKey)}
        description={error === 'untrusted' ? project.rootPath : undefined}>
        <div className={styles.text}>{t(view.textKey)}</div>
        {error === 'untrusted' && (
          <div className={styles.actions}>
            <Button variant="primary" size="sm" icon={ShieldCheck} onClick={handleTrust}>
              {waiting ? t('claudeCode.blocked.trust') : t('claudeCode.blocked.trustOnly')}
            </Button>
          </div>
        )}
        {(error === 'project-missing' || error === 'start-failed') && waiting && (
          <div className={styles.actions}>
            <Button size="sm" icon={RotateCw} onClick={handleRetry}>
              {t('claudeCode.blocked.retry')}
            </Button>
          </div>
        )}
        {error === 'cli-not-found' && (
          <div className={styles.actions}>
            <Button size="sm" icon={RotateCw} onClick={handleRecheck}>
              {t('claudeCode.checkAgain')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}

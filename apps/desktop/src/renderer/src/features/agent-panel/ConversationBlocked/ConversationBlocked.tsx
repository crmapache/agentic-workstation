import { RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'

import { useConversationActions } from '../conversation-actions.hooks'
import { BLOCKED_VIEWS } from './ConversationBlocked.constants'
import styles from './ConversationBlocked.module.scss'
import type { ConversationBlockedProps } from './ConversationBlocked.types'

/**
 * Почему разговор не может начаться и что с этим сделать: вернуть папку проекта, поставить
 * CLI, попробовать снова после сбоя. Сообщение, которое не ушло, ждёт в очереди рядом и
 * уходит, как только причина снята.
 */
export const ConversationBlocked = ({ conversation, error }: ConversationBlockedProps) => {
  const { t } = useTranslation()
  const { recheckCli, sendQueued } = useConversationActions()
  const view = BLOCKED_VIEWS[error]
  const [waiting] = conversation.queue

  const handleRecheck = () => void recheckCli()

  const handleRetry = () => {
    if (waiting) void sendQueued(conversation.id, waiting.id)
  }

  return (
    <div className={styles.conversationBlocked}>
      <Card icon={view.icon} title={t(view.titleKey)}>
        <div className={styles.text}>{t(view.textKey)}</div>
        {(error === 'project-missing' || error === 'start-failed') && waiting && (
          <div className={styles.actions}>
            <Button size="sm" icon={RotateCw} onClick={handleRetry}>
              {t('agentPanel.blocked.retry')}
            </Button>
          </div>
        )}
        {error === 'cli-not-found' && (
          <div className={styles.actions}>
            <Button size="sm" icon={RotateCw} onClick={handleRecheck}>
              {t('agentPanel.checkAgain')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}

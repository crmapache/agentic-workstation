import { MessageSquarePlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import type { NoChatsProps } from '../ClaudeCodeView.types'
import { useClaudeActions } from '../../claude-actions.hooks'

/**
 * Экран, когда человек закрыл последнюю вкладку проекта (как Welcome в ACC): не новая
 * пустая вкладка сама собой, а приглашение начать. ⌘T и вернуть закрытую тоже работают.
 */
export const NoChats = ({ project }: NoChatsProps) => {
  const { t } = useTranslation()
  const { newConversation } = useClaudeActions()

  const handleStart = () => void newConversation(project.id)

  return (
    <EmptyState
      icon={MessageSquarePlus}
      title={t('claudeCode.tabs.noChats.title')}
      action={
        <Button variant="primary" onClick={handleStart}>
          {t('claudeCode.tabs.noChats.button')}
        </Button>
      }
    />
  )
}

import { FolderX, CircleAlert, ShieldQuestion, SquareTerminal } from 'lucide-react'

import type { ConversationError } from '@shared/conversation'

import type { BlockedView } from './ConversationBlocked.types'

/**
 * Доверие к папке ждёт решения человека - оранжевая карточка, как вопрос CLI.
 * Пропавшая папка, CLI и сбой подготовки исправляются вне панели - спокойная.
 */
export const BLOCKED_VIEWS: Record<ConversationError, BlockedView> = {
  untrusted: {
    icon: ShieldQuestion,
    tone: 'accent',
    titleKey: 'agentPanel.blocked.trustTitle',
    textKey: 'agentPanel.blocked.trustText',
  },
  'project-missing': {
    icon: FolderX,
    tone: 'neutral',
    titleKey: 'agentPanel.blocked.missingTitle',
    textKey: 'agentPanel.blocked.missingText',
  },
  'cli-not-found': {
    icon: SquareTerminal,
    tone: 'neutral',
    titleKey: 'agentPanel.blocked.cliTitle',
    textKey: 'agentPanel.blocked.cliText',
  },
  'start-failed': {
    icon: CircleAlert,
    tone: 'neutral',
    titleKey: 'agentPanel.blocked.startTitle',
    textKey: 'agentPanel.blocked.startText',
  },
}

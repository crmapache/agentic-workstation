import { FolderX, CircleAlert, SquareTerminal } from 'lucide-react'

import type { ConversationError } from '@shared/conversation'

import type { BlockedView } from './ConversationBlocked.types'

/**
 * Пропавшая папка, CLI и сбой подготовки исправляются вне панели - карточка спокойная, без
 * акцента вопроса.
 */
export const BLOCKED_VIEWS: Record<ConversationError, BlockedView> = {
  'project-missing': {
    icon: FolderX,
    titleKey: 'agentPanel.blocked.missingTitle',
    textKey: 'agentPanel.blocked.missingText',
  },
  'cli-not-found': {
    icon: SquareTerminal,
    titleKey: 'agentPanel.blocked.cliTitle',
    textKey: 'agentPanel.blocked.cliText',
  },
  'start-failed': {
    icon: CircleAlert,
    titleKey: 'agentPanel.blocked.startTitle',
    textKey: 'agentPanel.blocked.startText',
  },
}

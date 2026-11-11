import { FolderX, CircleAlert, ShieldQuestion, SquareTerminal } from 'lucide-react'

import type { ConversationError } from '@shared/claude'

import type { BlockedView } from './ConversationBlocked.types'

/**
 * Доверие к папке ждёт решения человека - оранжевая карточка, как вопрос CLI.
 * Пропавшая папка, CLI и сбой подготовки исправляются вне панели - спокойная.
 */
export const BLOCKED_VIEWS: Record<ConversationError, BlockedView> = {
  untrusted: {
    icon: ShieldQuestion,
    tone: 'accent',
    titleKey: 'claudeCode.blocked.trustTitle',
    textKey: 'claudeCode.blocked.trustText',
  },
  'project-missing': {
    icon: FolderX,
    tone: 'neutral',
    titleKey: 'claudeCode.blocked.missingTitle',
    textKey: 'claudeCode.blocked.missingText',
  },
  'cli-not-found': {
    icon: SquareTerminal,
    tone: 'neutral',
    titleKey: 'claudeCode.blocked.cliTitle',
    textKey: 'claudeCode.blocked.cliText',
  },
  'start-failed': {
    icon: CircleAlert,
    tone: 'neutral',
    titleKey: 'claudeCode.blocked.startTitle',
    textKey: 'claudeCode.blocked.startText',
  },
}

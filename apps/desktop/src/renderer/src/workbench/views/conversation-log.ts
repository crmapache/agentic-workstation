import { lazy } from 'react'

import type { ConversationLog } from '../../state/conversation-log.context'

/**
 * Разговор провайдера для чужих видов (журнал шага сценария): лента панели Claude Code только
 * для чтения и её разбор Markdown. Грузится, как сама панель, при первом показе - тяжёлые
 * разбор и подсветка не едут в начальный кусок окна. Тот, кто рисует, оборачивает в Suspense.
 */
export const CONVERSATION_LOG: ConversationLog = {
  Feed: lazy(() =>
    import('../../features/claude-code/ConversationLog/ConversationLog').then((module) => ({
      default: module.ConversationLog,
    })),
  ),
  Text: lazy(() =>
    import('../../features/claude-code/Markdown/Markdown').then((module) => ({
      default: module.Markdown,
    })),
  ),
}

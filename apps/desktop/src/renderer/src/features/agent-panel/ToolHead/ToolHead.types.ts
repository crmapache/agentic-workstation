import type { ToolFeedItem } from '@shared/conversation-feed'

import type { ToolMeta } from '../tool-summary.utils'

export type ToolHeadProps = {
  tool: ToolFeedItem
  meta: ToolMeta
  /** Есть что раскрыть: тогда стрелка и вся строка - кнопка. */
  canOpen: boolean
  expanded: boolean
  onToggle: () => void
}

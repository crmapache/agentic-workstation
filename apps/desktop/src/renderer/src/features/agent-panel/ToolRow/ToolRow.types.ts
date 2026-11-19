import type { ToolFeedItem } from '@shared/conversation-feed'

import type { DetailLine } from '../tool-summary.utils'

export type ToolRowProps = {
  tool: ToolFeedItem
}

export type ToolDetailsProps = {
  tool: ToolFeedItem
  lines: DetailLine[]
  /** Сколько строк вывода не показано. */
  hidden: number
}

import type { Conversation } from '@shared/conversation'
import type { FeedItem } from '@shared/conversation-feed'

export type AgentStreamViewProps = {
  conversation: Conversation
  items: readonly FeedItem[]
}

export type AgentStreamProps = {
  itemId: string
  items: readonly FeedItem[]
}

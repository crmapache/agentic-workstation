import type { FeedItem, FleetAgent } from '@shared/conversation-feed'

export type FleetAgentViewProps = {
  conversationId: string
  /** Карточка workflow и номер агента: агент ищется в ленте заново на каждой перерисовке. */
  itemId: string
  index: number
  items: readonly FeedItem[]
}

export type FleetAgentBodyProps = {
  conversationId: string
  agent: FleetAgent
}

export type FleetSectionProps = {
  caption: string
  text: string
}

import type { FeedItem, ToolFeedItem } from '@shared/conversation-feed'

export type AgentCardProps = {
  /** Вызов агента или флота: Task, Agent, Workflow, агент скилла. */
  tool: ToolFeedItem
  /** Что делал агент: его вызовы и текст, по порядку. */
  steps: readonly FeedItem[]
}

export type AgentDurationProps = {
  tool: ToolFeedItem
}

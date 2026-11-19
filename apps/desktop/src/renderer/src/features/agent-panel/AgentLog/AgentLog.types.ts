import type {
  FeedItem,
  ToolFeedItem,
  ThinkingFeedItem,
  AssistantFeedItem,
} from '@shared/conversation-feed'

export type AgentLogProps = {
  /** Вызов агента или флота (Task, Agent, Workflow, агент скилла). */
  tool: ToolFeedItem
  /** Его строки из потока (parentToolUseId - этот вызов), по порядку. */
  steps: readonly FeedItem[]
}

export type JournalStepsProps = {
  steps: readonly FeedItem[]
}

export type AgentWorkingProps = {
  tool: ToolFeedItem
}

/** Почему агент закрыт без ответа или с ошибкой - строкой в конце журнала. */
export type EndNote = { text: string; tone: 'bad' | 'dim' }

/** Строка журнала: вызов, пачка мыслей подряд (одной строкой, как в ленте) или реплика. */
export type JournalRow =
  | { kind: 'tool'; id: string; item: ToolFeedItem }
  | { kind: 'thinking'; id: string; items: ThinkingFeedItem[] }
  | { kind: 'remark'; id: string; item: AssistantFeedItem }

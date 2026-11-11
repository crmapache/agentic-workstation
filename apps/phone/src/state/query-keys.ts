/**
 * Ключи кэша React Query. Всё под ключами - зеркало того, что держит IDE (она владеет
 * состоянием, телефон только показывает), плюс список пар из хранилища телефона.
 */
export const queryKeys = {
  machines: ['machines'] as const,
  inventory: (agentId: string) => ['inventory', agentId] as const,
  conversation: (agentId: string, conversationId: string) =>
    ['conversation', agentId, conversationId] as const,
  feed: (agentId: string, conversationId: string) => ['feed', agentId, conversationId] as const,
  queues: (agentId: string, scope: string) => ['queues', agentId, scope] as const,
  run: (agentId: string, runId: string) => ['run', agentId, runId] as const,
  shelves: (agentId: string, projectKey: string) => ['shelves', agentId, projectKey] as const,
}

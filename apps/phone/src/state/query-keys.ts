/**
 * Ключи кэша React Query. Всё под ключами - зеркало того, что держит IDE (она владеет
 * состоянием, телефон только показывает), плюс список пар из хранилища телефона и то, что
 * телефон читает командой по просьбе экрана (полки, история, картинка сообщения).
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
  history: (agentId: string, projectKey: string, provider: string) =>
    ['history', agentId, projectKey, provider] as const,
  image: (agentId: string, conversationId: string, messageId: string, index: number) =>
    ['image', agentId, conversationId, messageId, index] as const,
}

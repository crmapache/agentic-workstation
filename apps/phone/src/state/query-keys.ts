/**
 * Ключи кэша React Query. Всё под ключами - зеркало того, что держит IDE (она владеет
 * состоянием, телефон только показывает), плюс список пар из хранилища телефона и то, что
 * телефон читает командой по просьбе экрана (полки, сценарий, журнал шага, история, картинка
 * сообщения, откат, аккаунты и коннекторы машины).
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
  scenario: (agentId: string, projectKey: string, scope: string, scenarioId: string) =>
    ['scenario', agentId, projectKey, scope, scenarioId] as const,
  stepLog: (agentId: string, projectKey: string, runId: string, stepKey: string) =>
    ['stepLog', agentId, projectKey, runId, stepKey] as const,
  rewindPreview: (agentId: string, conversationId: string, messageId: string) =>
    ['rewindPreview', agentId, conversationId, messageId] as const,
  accounts: (agentId: string) => ['accounts', agentId] as const,
  connectors: (agentId: string) => ['connectors', agentId] as const,
}

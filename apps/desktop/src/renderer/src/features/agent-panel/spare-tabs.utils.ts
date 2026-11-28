import type { Conversation } from '@shared/conversation'

/**
 * Какие запасные вкладки убрать: в проекте рядом уже есть разговор, о котором просили (открыл
 * человек, агент, телефон, вернулся из истории), а в запасной ничего не написано. С черновиком -
 * остаётся: набранное не теряется, а вкладка с ним уже нужна человеку.
 */
export const sparesToDrop = (
  conversations: readonly Conversation[],
  hasDraft: (conversationId: string) => boolean,
): string[] => {
  const busyProjects = new Set(
    conversations.filter((one) => one.spare !== true).map((one) => one.projectPath),
  )

  return conversations
    .filter((one) => one.spare === true && busyProjects.has(one.projectPath) && !hasDraft(one.id))
    .map((one) => one.id)
}

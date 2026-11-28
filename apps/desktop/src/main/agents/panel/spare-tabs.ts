import type { Conversation } from '@shared/conversation'
import { isBlankChat } from '@shared/conversation'

/**
 * Запасная вкладка (Conversation.spare): пустая, не закреплена, ни о чём не спрашивает, и
 * открыла её сама IDE (у проекта не было вкладок) или она вернулась с диска - unasked. Открытое
 * по просьбе в этом запуске (⌘T, «+», история, форк, возврат закрытой, агент, телефон) не
 * запасное, даже пустое.
 */
export const isSpare = (conversation: Conversation, unasked: ReadonlySet<string>): boolean =>
  unasked.has(conversation.id) &&
  isBlankChat(conversation) &&
  conversation.pinned !== true &&
  conversation.pending === null

/** Разговоры для окна: запасные - с отметкой, по ней окно убирает их, когда рядом есть разговор. */
export const markSpares = (
  conversations: readonly Conversation[],
  unasked: ReadonlySet<string>,
): Conversation[] =>
  conversations.map((conversation) =>
    isSpare(conversation, unasked) ? { ...conversation, spare: true } : conversation,
  )

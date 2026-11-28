import type { Conversation } from '@shared/conversation'
import { isBlankChat } from '@shared/conversation'

/**
 * Можно ли закрыть вкладку - крестиком, средней кнопкой и ⌘W. Закреплённую - нет, пока её не
 * открепят. Последнюю пустую - нет: на её месте встал бы экран «Let's start», где та же кнопка
 * нового разговора.
 */
export const isClosableTab = (conversation: Conversation, tabCount: number): boolean =>
  conversation.pinned !== true && (tabCount > 1 || !isBlankChat(conversation))

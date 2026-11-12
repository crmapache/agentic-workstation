import type { Conversation } from '@shared/claude'

/**
 * Новый пустой разговор: ни хода, ни своего имени, ни очереди, не форк. Черновик в поле не в
 * счёт: он лежит под id вкладки и не теряется, а вкладка с ним - всё та же «New chat».
 */
export const isBlankChat = (conversation: Conversation): boolean =>
  conversation.title === '' &&
  conversation.titleSource === 'default' &&
  conversation.outcome === 'none' &&
  conversation.status === 'idle' &&
  conversation.queue.length === 0 &&
  conversation.fork === null

/**
 * Можно ли закрыть вкладку - крестиком, средней кнопкой и ⌘W. Последнюю пустую - нет: на её
 * месте встал бы экран «Let's start», где та же кнопка нового разговора.
 */
export const isClosableTab = (conversation: Conversation, tabCount: number): boolean =>
  tabCount > 1 || !isBlankChat(conversation)

import type {
  InboxItem,
  InboxState,
  InboxOutcome,
  InboxActRequest,
  InboxReminderRequest,
} from '../inbox'

type ItemsRequest = { itemIds: string[] }

/**
 * Часть контракта (contract.ts) про уведомления IDE (ADR 0069): список, кнопки, напоминания.
 * Правила - .claude/rules/ipc-contract.md.
 */
export type InboxInvokeContract = {
  'inbox:get': { request: void; response: InboxState }
  /** Нажатие кнопки уведомления; ответ - новое состояние или причина отказа. */
  'inbox:act': { request: InboxActRequest; response: InboxOutcome }
  /** Закрыть уведомления; вопрос прогона закрытием отклоняется. */
  'inbox:dismiss': { request: ItemsRequest; response: InboxOutcome }
  'inbox:markRead': { request: ItemsRequest; response: InboxState }
  /** Убрать закрытые из списка. */
  'inbox:clearDone': { request: void; response: InboxState }
  /** Напоминание себе на время - без ИИ. */
  'inbox:remind': { request: InboxReminderRequest; response: InboxOutcome }
}

export type InboxEventContract = {
  'inbox:changed': InboxState
  /** Пришло новое (или пришёл срок напоминания): окну - всплывающая карточка и звук. */
  'inbox:arrived': InboxItem
  /** Человек нажал системное уведомление: окну - показать это уведомление. */
  'inbox:reveal': { itemId: string }
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const INBOX_CHANNELS = {
  'inbox:get': true,
  'inbox:act': true,
  'inbox:dismiss': true,
  'inbox:markRead': true,
  'inbox:clearDone': true,
  'inbox:remind': true,
} satisfies Record<keyof InboxInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const INBOX_EVENTS = {
  'inbox:changed': true,
  'inbox:arrived': true,
  'inbox:reveal': true,
} satisfies Record<keyof InboxEventContract, true>

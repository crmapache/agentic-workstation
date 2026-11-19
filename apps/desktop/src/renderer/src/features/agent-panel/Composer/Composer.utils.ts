import type { ParseKeys } from 'i18next'

import type { Conversation, QueuedMessage } from '@shared/conversation'
import type { FeedItem } from '@shared/conversation-feed'
import type { DraftToken } from '@shared/message-draft'

/** Подсказка в пустом поле: ждёт ответа на вопрос, идёт ход, режим плана или обычная. */
export const placeholderKey = (conversation: Conversation | null): ParseKeys => {
  if (conversation?.pending) return 'agentPanel.composer.placeholderWaiting'
  if (conversation && conversation.status !== 'idle')
    return 'agentPanel.composer.placeholderRunning'
  if (conversation?.permissionMode === 'plan') return 'agentPanel.composer.placeholderPlan'

  return 'agentPanel.composer.placeholder'
}

/**
 * Сколько картинок уже ушло в разговоре - в отправленных сообщениях и в очереди: номера
 * [Image #N] продолжают счёт через весь разговор, а не начинаются с единицы каждый раз.
 */
export const imageBaseOf = (items: readonly FeedItem[], queue: readonly QueuedMessage[]): number =>
  items.reduce((sum, item) => (item.kind === 'user' ? sum + item.images.length : sum), 0) +
  queue.reduce((sum, item) => sum + item.imageCount, 0)

/** «!» в начале - команда терминала, а не сообщение модели. */
export const isShellDraft = (tokens: readonly DraftToken[]): boolean => {
  const first = tokens[0]

  return first?.kind === 'text' && first.value.startsWith('!')
}

/**
 * Посреди /compact сообщение ждёт очереди: сжатие глотает stdin, и написанное туда
 * пропало бы (замер ACC).
 */
export const isCompacting = (items: readonly FeedItem[], conversation: Conversation | null) =>
  conversation !== null &&
  conversation.status !== 'idle' &&
  /^\/compact\b/.test(items.findLast((item) => item.kind === 'user')?.text ?? '')

/** id строки подсказки: по нему поле говорит скринридеру, какая выбрана. */
export const suggestOptionId = (listId: string, index: number): string =>
  `${listId}-option-${index}`

/**
 * Строка поля, на которой стоит каретка: по середине того, что перед ней (символ или чип), во
 * всю высоту строки поля. Серый синтаксис встаёт в неё - на ту же базовую линию, что набранный
 * текст, а не на верх соседнего символа, который ниже строки на её межстрочный зазор.
 */
export const caretLineBox = (
  place: { left: number; top: number; height: number },
  lineHeight: number,
): { left: number; top: number; height: number } =>
  Number.isFinite(lineHeight) && lineHeight > 0
    ? { left: place.left, top: place.top + (place.height - lineHeight) / 2, height: lineHeight }
    : place

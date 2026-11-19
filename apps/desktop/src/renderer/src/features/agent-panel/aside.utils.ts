import type { DraftToken } from '@shared/message-draft'

import { tokensText } from './draft.utils'

/**
 * Вопрос в строке `/btw …` или null, если строка не он. Голый /btw - пустой вопрос: он
 * открывает цепочку снова, как в терминале. Переводы строк остаются: вопрос - проза, а
 * общий разбор команды режет значение по пробелам и склеил бы строки в одну.
 */
export const asideQuestion = (text: string): string | null => {
  const trimmed = text.trimStart()
  const match = /^\/btw(?=\s|$)/.exec(trimmed)

  return match ? trimmed.slice(match[0].length).trim() : null
}

/** В поле вопрос сбоку: Send становится «Ask aside», Queue пропадает (как Run у «!»). */
export const isAsideDraft = (tokens: readonly DraftToken[]): boolean =>
  asideQuestion(tokensText(tokens)) !== null

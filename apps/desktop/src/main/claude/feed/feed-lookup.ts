import type { FeedItem } from '@shared/claude-feed'

import type { CliMessage } from '../cli/cli-messages'
import { recordField, stringField, parseCliLine } from '../cli/cli-messages'
import { FeedBuilder } from './feed-builder'
import { queuedPrompt } from './queued-prompt'

/**
 * Начало id элемента ленты до «:» - то, что записано в строке транскрипта, из которой
 * элемент вырос: у ответа модели id - «id сообщения:номер блока» (assistant-blocks.ts), у
 * сообщения человека - uuid строки, у написанного посреди хода - наш uuid во вложении
 * очереди (queued-prompt.ts). Поменяется схема id ленты - поменять и здесь.
 */
const sourceKey = (itemId: string): string => itemId.split(':', 1)[0] ?? itemId

/**
 * Строка - источник элемента с этим ключом, а не та, что на него лишь ссылается: uuid
 * сообщения стоит и в parentUuid следующей строки.
 */
const isSourceOf = (message: CliMessage, key: string): boolean =>
  stringField(message, 'uuid') === key ||
  (message.type === 'assistant' && stringField(recordField(message, 'message'), 'id') === key) ||
  queuedPrompt(message)?.id === key

/**
 * Строки-источники элементов keys. Подстрокой - сначала: в длинном транскрипте строк
 * тысячи, а нужных несколько, и разбирать каждую ради них незачем.
 */
const sourceLines = function* (lines: readonly string[], keys: readonly string[]) {
  for (const [index, line] of lines.entries()) {
    const named = keys.filter((key) => line.includes(key))
    const message = named.length > 0 ? parseCliLine(line) : null

    if (message && named.some((key) => isSourceOf(message, key))) yield { index, message }
  }
}

/** Номер первой строки, из которой растёт элемент itemId, или -1. */
export const sourceLineOf = (lines: readonly string[], itemId: string): number =>
  sourceLines(lines, [sourceKey(itemId)]).next().value?.index ?? -1

/**
 * Элементы ленты по id прямо из строк транскрипта - без страниц и без разбора всего файла.
 * Строки-источники разбирает тот же сборщик, что и ленту, поэтому элемент выходит тем же
 * (id, текст). Миниатюр у картинок нет: это строка полки закреплённых, а не лента. Порядок -
 * порядок разговора; чего в строках нет, того нет и в ответе.
 */
export const itemsFromLines = (
  lines: readonly string[],
  itemIds: readonly string[],
): FeedItem[] => {
  const builder = new FeedBuilder()

  for (const { message } of sourceLines(lines, [...new Set(itemIds.map(sourceKey))])) {
    builder.apply(message, true)
  }

  builder.finishReplay()

  return builder.items.filter((item) => itemIds.includes(item.id))
}

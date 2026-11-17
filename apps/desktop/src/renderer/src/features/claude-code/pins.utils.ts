import type { FeedItem, UserFeedItem, AssistantFeedItem } from '@shared/claude-feed'

import { hintPreview } from './chips.utils'
import { messageLine, messageDraft } from './message.utils'
import { PIN_LIMIT, PIN_LINE_CHARS } from './pins.constants'

/**
 * Закреплённые сообщения - правила полки над лентой. Закрепить можно своё сообщение и
 * ответ: остальное в ленте - механика хода, к ней не возвращаются (ACC).
 */

export type PinnedItem = UserFeedItem | AssistantFeedItem

export const isPinnable = (item: FeedItem): item is PinnedItem =>
  item.kind === 'user' || item.kind === 'assistant'

/**
 * Закрепить или открепить. Полная полка нового не берёт и отдаёт тот же массив: кнопки
 * к этому времени уже погашены, а правило - здесь, потому что оно и решает, чего стоит
 * закреп.
 */
export const togglePin = (pins: readonly string[], id: string): readonly string[] => {
  if (pins.includes(id)) return pins.filter((pinned) => pinned !== id)

  return pins.length >= PIN_LIMIT ? pins : [...pins, id]
}

/**
 * Закреплённые - в порядке разговора, а не закрепления: три строки читаются оглавлением,
 * только когда стоят в том порядке, в каком были сказаны. Только среди items: что выше
 * загруженного, добирает shelfItems.
 */
export const pinnedItems = (items: readonly FeedItem[], pins: readonly string[]): PinnedItem[] =>
  pins.length === 0
    ? []
    : items.filter((item): item is PinnedItem => isPinnable(item) && pins.includes(item.id))

/**
 * Закрепы, которых нет среди загруженного: лента открывается последней страницей, а
 * закреплённое могло остаться выше - его ищет главный процесс.
 */
export const unloadedPins = (items: readonly FeedItem[], pins: readonly string[]): string[] =>
  pins.filter((id) => !items.some((item) => item.id === id))

/**
 * Полка целиком: найденное главным процессом выше загруженного - сверху (оно раньше всего
 * загруженного, в порядке разговора), ниже - загруженное, живым из ленты. found - ответ
 * главного процесса; null - его ещё нет или транскрипт не прочитался.
 */
export const shelfItems = (
  items: readonly FeedItem[],
  pins: readonly string[],
  found: readonly FeedItem[] | null,
): PinnedItem[] => {
  const loaded = pinnedItems(items, pins)
  const above = pinnedItems(found ?? [], pins).filter(
    (item) => !loaded.some((own) => own.id === item.id),
  )

  return [...above, ...loaded]
}

/**
 * Закрепы, которых нет в разговоре: спросили главный процесс, а он их не нашёл ни в ленте,
 * ни в транскрипте (откат, /clear). Их снимают - иначе они молча держали бы место на полке.
 */
export const gonePins = (asked: readonly string[], found: readonly FeedItem[]): string[] =>
  asked.filter((id) => !found.some((item) => item.id === id))

/** Ответ без разметки: строка полки - напоминание, а не markdown. */
const plainAnswer = (text: string): string =>
  text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[`*]+/g, '')

const pinText = (item: PinnedItem): string =>
  item.kind === 'assistant' ? plainAnswer(item.text) : messageLine(messageDraft(item))

/** Закреплённое одной строкой: пробелы схлопнуты, длина - с запасом под любую ширину. */
export const pinLine = (item: PinnedItem): string => {
  const text = pinText(item).replace(/\s+/g, ' ').trim()

  return text.length > PIN_LINE_CHARS ? `${text.slice(0, PIN_LINE_CHARS)}…` : text
}

/** Подсказка строки - первые строки, как у чипа: подсказка не место читать целиком. */
export const pinHint = (item: PinnedItem): string => hintPreview(pinText(item))

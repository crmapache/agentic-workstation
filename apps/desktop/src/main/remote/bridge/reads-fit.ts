import type { HistoryEntry } from '@shared/claude'
import type { FeedItem } from '@shared/claude-feed'

import type {
  HistoryWire,
  FeedPageWire,
  MessageImageWire,
} from '@agentic-workstation/remote-protocol/wire-types'

import type { Redact } from './fit'
import { sizeOf, BODY_BUDGET, tailThatFits } from './fit'

/**
 * Ответы на чтение по просьбе телефона - историю, страницу ленты выше и картинку - в один кадр.
 * Ответ команды на провод частями не режется (части - только от телефона), поэтому каждый
 * меряется здесь и урезается честно: история - свежими, страница - ближними к ленте элементами,
 * картинка - уменьшенной копией с пометкой reduced.
 */

/** Под ответ: кадр без конверта итога команды (вид, id, ok). */
export const READ_BUDGET = BODY_BUDGET - 512

/** Сколько прошлых разговоров уходит телефону: свежие, старее - «есть ещё». */
export const HISTORY_ENTRIES = 100

/** Сколько элементов в странице ленты выше: экран-другой, а не вся история. */
export const PAGE_ITEMS = 60

/**
 * Ступени уменьшения картинки: длинная сторона и качество JPEG. Экран телефона - около 1200
 * точек по ширине, крупнее него в кадр всё равно почти ничего не влезает; дальше - мельче, пока
 * не влезет. Не влезла и самая мелкая - картинки на телефоне нет, есть миниатюра.
 */
export const PICTURE_STEPS = [
  { edge: 1600, quality: 80 },
  { edge: 1280, quality: 75 },
  { edge: 1024, quality: 70 },
  { edge: 800, quality: 65 },
  { edge: 640, quality: 60 },
] as const

/** История проекта: свежие сверху, без папок в заголовках, сколько влезло в кадр. */
export const historyThatFits = (
  entries: readonly HistoryEntry[],
  redact: Redact,
  budget = READ_BUDGET,
): HistoryWire => {
  const fresh = [...entries]
    .sort((first, second) => second.updatedAt - first.updatedAt)
    .slice(0, HISTORY_ENTRIES)
    .map(({ sessionId, title, updatedAt, isOpen }) => ({
      sessionId,
      title: redact(title),
      updatedAt,
      isOpen,
    }))

  while (fresh.length > 0 && sizeOf({ entries: fresh, more: true }) > budget) fresh.pop()

  return { entries: fresh, more: fresh.length < entries.length }
}

/**
 * Страница перед элементом before: ближние к нему элементы, сколько влезло. null - такого
 * элемента в ленте IDE нет (откат его убрал, у телефона чужая лента): страницу ставить некуда.
 * hasEarlier - выше осталось в ленте IDE или в транскрипте.
 */
export const pageBefore = (
  items: readonly FeedItem[],
  before: string,
  transcriptHasEarlier: boolean,
  redact: Redact,
  budget = READ_BUDGET,
): FeedPageWire | null => {
  const at = items.findIndex((item) => item.id === before)

  if (at === -1) return null

  const tail = tailThatFits(items.slice(0, at), budget, PAGE_ITEMS, redact)

  return { items: tail.items, hasEarlier: tail.cut || transcriptHasEarlier }
}

/**
 * Картинка в кадр: как есть, если влезает, иначе уменьшенная по ступеням. null - не влезла и
 * самой мелкой или не читается: телефон покажет миниатюру и скажет, что оригинал в IDE. Байты
 * data URL - знаки ASCII, в JSON не экранируются: длина строки и есть её вес.
 */
export const pictureThatFits = (
  dataUrl: string,
  shrink: (dataUrl: string, edge: number, quality: number) => string | null,
  budget = READ_BUDGET,
): MessageImageWire | null => {
  if (dataUrl.length <= budget) return { dataUrl, reduced: false }

  for (const step of PICTURE_STEPS) {
    const smaller = shrink(dataUrl, step.edge, step.quality)

    if (smaller === null) return null
    if (smaller.length <= budget) return { dataUrl: smaller, reduced: true }
  }

  return null
}

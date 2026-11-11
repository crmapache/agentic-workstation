import type { PartMessage } from './phone-messages'
import { PROTOCOL_VERSION } from './phone-messages'

/**
 * Сообщение тяжелее кадра (почти всегда фото с телефона) идёт кусками своего же JSON-текста:
 * телефон режет, IDE склеивает и пускает в ту же дверь, что и целое. Частями может прийти
 * только команда из MAY_ARRIVE_IN_PARTS.
 */

/** Кусок текста в одном кадре: с запасом под конверт, печать и экранирование JSON. */
export const PART_CHARS = 96 * 1024

export const MAX_PARTS = 40

/** Потолок собранного сообщения в знаках. */
export const MAX_ASSEMBLED_CHARS = MAX_PARTS * PART_CHARS

/** Сколько недособранных сообщений устройство держит разом. */
export const MAX_IN_FLIGHT = 2

/** Сколько ждать недостающие куски. */
export const PARTS_PATIENCE_MS = 3 * 60_000

/** Разрезать JSON-текст сообщения на куски; влезает в один кадр - один кусок не нужен. */
export const splitIntoParts = (id: string, text: string): PartMessage[] => {
  const count = Math.ceil(text.length / PART_CHARS)

  if (count > MAX_PARTS) throw new Error('a message too big even for parts')

  return Array.from({ length: count }, (_, index) => ({
    p: PROTOCOL_VERSION,
    k: 'part' as const,
    id,
    i: index,
    n: count,
    d: text.slice(index * PART_CHARS, (index + 1) * PART_CHARS),
  }))
}

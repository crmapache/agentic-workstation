import { encodeBody } from './body'
import { MAX_BODY_BYTES } from './frame'
import { MAX_MESSAGE_BYTES } from './message-size'
import type { PartMessage } from './phone-messages'
import { PROTOCOL_VERSION } from './phone-messages'

/**
 * Сообщение тяжелее кадра (почти всегда фото с телефона) идёт кусками своего же JSON-текста:
 * телефон режет, IDE склеивает и пускает в ту же дверь, что и целое. Частями может прийти
 * только команда из MAY_ARRIVE_IN_PARTS.
 *
 * Режется по байтам на проводе, а не по знакам: кусок едет строкой внутри JSON, и каждая
 * кавычка и обратная косая черта текста удваивается, а буква не из ASCII весит два-четыре
 * байта. Кусок «в 96 тысяч знаков» с кавычками или кириллицей не влезал в кадр.
 */

/**
 * Частей не больше: сообщение в MAX_MESSAGE_BYTES - около 17 кадров, остальное - запас на
 * экранирование (текст до 100 тысяч знаков из одних кавычек весит вдвое больше).
 */
export const MAX_PARTS = 24

/** Сколько недособранных сообщений устройство держит разом. */
export const MAX_IN_FLIGHT = 2

/** Сколько ждать недостающие куски. */
export const PARTS_PATIENCE_MS = 3 * 60_000

/** Потолок собранного сообщения - то же число, что у телефона и схемы команд. */
export const MAX_ASSEMBLED_BYTES = MAX_MESSAGE_BYTES

/**
 * Сколько байт займёт знак внутри строки JSON: как его пишет JSON.stringify (кавычка и
 * обратная черта - парой, управляющие - \n или \u00XX, одинокая половина суррогата - \uXXXX),
 * остальное - UTF-8.
 */
const escapedBytes = (code: number, lone: boolean): number => {
  if (code === 0x22 || code === 0x5c) return 2
  if (code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d) return 2
  if (code < 0x20 || lone) return 6
  if (code < 0x80) return 1
  if (code < 0x800) return 2
  if (code > 0xffff) return 4

  return 3
}

/** Конверт куска без текста - с номерами наибольшей длины: место под них вычитается заранее. */
const envelopeBytes = (id: string): number =>
  encodeBody({ p: PROTOCOL_VERSION, k: 'part', id, i: MAX_PARTS, n: MAX_PARTS, d: '' }).length

/** Границы кусков: каждый влезает в capacity байт строкой JSON, пара суррогатов не рвётся. */
const cutPoints = (text: string, capacity: number): number[] => {
  const ends: number[] = []
  let used = 0
  let index = 0

  while (index < text.length) {
    const code = text.codePointAt(index) ?? 0
    const width = code > 0xffff ? 2 : 1
    const lone = code >= 0xd800 && code <= 0xdfff
    const cost = escapedBytes(code, lone)

    if (used + cost > capacity && used > 0) {
      ends.push(index)
      used = 0
    }

    used += cost
    index += width
  }

  ends.push(text.length)

  return ends
}

/**
 * Разрезать JSON-текст сообщения на куски, каждый из которых влезает в тело кадра budget вместе
 * со своим конвертом. Текст, который сам больше кадра, всегда даёт не меньше двух кусков; влезает
 * он в один кусок только тогда, когда резать было незачем, - и тогда кусков тоже два (n ≥ 2
 * у слова part), а не одно слово, которое IDE не примет.
 */
export const splitIntoParts = (
  id: string,
  text: string,
  budget: number = MAX_BODY_BYTES,
): PartMessage[] => {
  const ends = cutPoints(text, budget - envelopeBytes(id))

  if (ends.length === 1 && text.length > 1) {
    const middle = Math.floor(text.length / 2)
    const code = text.charCodeAt(middle)
    // Середина не рвёт пару суррогатов: вторая половина пары уходит в первый кусок.
    const at = code >= 0xdc00 && code <= 0xdfff ? middle + 1 : middle

    ends.splice(0, 1, at, text.length)
  }

  if (ends.length > MAX_PARTS) throw new Error('a message too big even for parts')

  return ends.map((end, index) => ({
    p: PROTOCOL_VERSION,
    k: 'part' as const,
    id,
    i: index,
    n: ends.length,
    d: text.slice(index === 0 ? 0 : (ends[index - 1] ?? 0), end),
  }))
}

/**
 * Ответ головы: одна-две фразы для человека и маленький JSON-объект для движка. Читается
 * терпимо и без схемы (`--json-schema` - аргумент с кавычками, а кавычки в аргументах
 * запрещены): ограда вокруг объекта или её нет - не повод ронять ночь. Поле не той формы
 * (объект вместо строки) - поле, которого не сказали, и движок умеет с этим жить.
 */

export type ReplyBody = Record<string, unknown>

export type HeadReply = { words: string; body: ReplyBody | null }

/**
 * Где начинается и кончается последний объект верхнего уровня. Идём вперёд со строками в
 * уме: путь с фигурной скобкой внутри кавычек не должен ломать хороший ответ.
 */
const lastObject = (text: string): [number, number] | null => {
  let depth = 0
  let start = -1
  let last: [number, number] | null = null
  let inString = false
  let escaped = false

  for (let at = 0; at < text.length; at += 1) {
    const character = text[at]

    if (escaped) escaped = false
    else if (inString && character === '\\') escaped = true
    else if (character === '"') inString = !inString
    else if (inString) continue
    else if (character === '{') {
      if (depth === 0) start = at
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) last = [start, at]
      if (depth < 0) depth = 0
    }
  }

  return last
}

// После закрывающей кавычки строки в JSON стоит только одно из этого (или конец объекта).
const AFTER_STRING = new Set([',', '}', ']', ':'])

/**
 * Строки объекта, которые голова написала по-человечески: «карточке "Save conversions"» с
 * прямыми кавычками внутри значения или перенос строки прямо в тексте. Строгий JSON на этом
 * падает, и прогон умирал на втором переспросе (17.11.2026: голова дважды процитировала имя
 * карточки). Кавычка закрывает строку, только если за ней идёт то, что в JSON идёт после
 * строки; остальные экранируются. Кавычка с запятой сразу за ней внутри значения так и
 * остаётся поломкой - её от конца строки не отличить.
 */
const mendStrings = (text: string): string => {
  let mended = ''
  let inString = false
  let escaped = false

  for (let at = 0; at < text.length; at += 1) {
    const character = text[at] ?? ''

    if (!inString) {
      if (character === '"') inString = true
      mended += character
    } else if (escaped) {
      escaped = false
      mended += character
    } else if (character === '\\') {
      escaped = true
      mended += character
    } else if (character === '\n') mended += '\\n'
    else if (character === '\r') mended += '\\r'
    else if (character === '\t') mended += '\\t'
    else if (character === '"') {
      const next = text.slice(at + 1).trimStart()[0]
      const closes = next === undefined || AFTER_STRING.has(next)

      if (closes) inString = false
      mended += closes ? '"' : '\\"'
    } else mended += character
  }

  return mended
}

/**
 * Последний объект в ограде ```json: с непарной кавычкой внутри значения границы объекта
 * по скобкам не найти, а ограда их даёт. Возвращает начало ограды и её содержимое.
 */
const fencedObject = (text: string): [number, string] | null => {
  const fences = [...text.matchAll(/```(?:json|JSON)?[ \t]*\n([\s\S]*?)\n?[ \t]*```/g)]
  const last = fences.findLast((fence) => (fence[1] ?? '').trim().startsWith('{'))

  return last ? [last.index, (last[1] ?? '').trim()] : null
}

/** Объект из текста, если это объект; иначе null. */
const asBody = (raw: string): ReplyBody | null => {
  try {
    const body = JSON.parse(raw) as unknown

    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as ReplyBody)
      : null
  } catch {
    return null
  }
}

/** Слова без открывающей ограды перед объектом: лишняя ``` в таймлайне читалась бы поломкой. */
const tidy = (words: string): string =>
  words
    .trim()
    .replace(/```(json|JSON)?\s*$/, '')
    .trim()

/** Ответ одного хода. */
export const readReply = (text: string): HeadReply => {
  const span = lastObject(text)
  const strict = span && asBody(text.slice(span[0], span[1] + 1))

  if (span && strict) return { words: tidy(text.slice(0, span[0])), body: strict }

  // Строгий JSON не прочёлся - тот же объект с починенными строками: из ограды, если она
  // есть, иначе по скобкам.
  const fenced = fencedObject(text)
  const [start, raw] = fenced ?? (span ? [span[0], text.slice(span[0], span[1] + 1)] : [0, ''])
  const mended = raw ? asBody(mendStrings(raw)) : null

  return mended
    ? { words: tidy(text.slice(0, start)), body: mended }
    : { words: tidy(text), body: null }
}

/** Ответ хода: слова каждой концовки по порядку и объект для движка. */
export type TurnReply = { said: string[]; body: ReplyBody | null }

/**
 * Ответ хода, который кончался не раз: объект - из последней концовки, где он есть (хук стиля
 * после ответа оставляет концовку без объекта, и переспрос потратил бы разрешение зря). Слова -
 * всех концовок: человек читает таймлайн, а Stop-хук, давший голове доработку, не делает её
 * первый ответ лишним. 26.11.2026 голова ответила человеку, хук стиля дал ей ещё ход, и в
 * таймлайн легла только фраза про стиль - ответ пропал.
 */
export const readEndings = (endings: readonly string[]): TurnReply => {
  const replies = endings.map(readReply)
  const said = replies
    .map((reply) => reply.words.trim())
    .filter((words, at, all) => words && all.indexOf(words) === at)

  return { said, body: replies.findLast((reply) => reply.body !== null)?.body ?? null }
}

/** Строковое поле ответа; другой формы - пусто. */
export const replyText = (body: ReplyBody, name: string): string => {
  const value = body[name]

  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

/** Да или нет ответа; «yes»/«no» строкой - тоже; другое - null (не сказано). */
export const replyFlag = (body: ReplyBody, name: string): boolean | null => {
  const value = body[name]

  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null

  const word = value.toLowerCase()

  if (word === 'true' || word === 'yes') return true
  if (word === 'false' || word === 'no') return false

  return null
}

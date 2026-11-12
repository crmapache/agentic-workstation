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

/** Слова без открывающей ограды перед объектом: лишняя ``` в таймлайне читалась бы поломкой. */
const tidy = (words: string): string =>
  words
    .trim()
    .replace(/```(json|JSON)?\s*$/, '')
    .trim()

/** Ответ одного хода. */
export const readReply = (text: string): HeadReply => {
  const span = lastObject(text)

  if (!span) return { words: tidy(text), body: null }

  try {
    const body = JSON.parse(text.slice(span[0], span[1] + 1)) as unknown

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return { words: tidy(text), body: null }
    }

    return { words: tidy(text.slice(0, span[0])), body: body as ReplyBody }
  } catch {
    return { words: tidy(text), body: null }
  }
}

/**
 * Ответ хода, который кончался не раз: объект - из последней концовки, где он есть (хук стиля
 * после ответа оставляет концовку без объекта, и переспрос потратил бы разрешение зря).
 */
export const readEndings = (endings: readonly string[]): HeadReply =>
  endings.map(readReply).findLast((reply) => reply.body !== null) ?? readReply(endings.join('\n\n'))

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

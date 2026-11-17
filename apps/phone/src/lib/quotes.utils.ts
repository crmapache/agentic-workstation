/** Короче этого выделение - промах пальца, а не цитата (как в ACC). */
export const MIN_QUOTE_CHARS = 3

/**
 * Выделенный кусок ответа - строкой цитаты: переводы строк и серии пробелов - одним пробелом.
 * IDE узнаёт цитаты сообщения по строкам «> » сверху, по строке на цитату (реплей ленты), так что
 * многострочная цитата распалась бы на несколько или ушла в текст. Короче MIN_QUOTE_CHARS - null.
 */
export const quoteOf = (selected: string): string | null => {
  const line = selected.replace(/\s+/g, ' ').trim()

  return line.length >= MIN_QUOTE_CHARS ? line : null
}

/** Текст сообщения с цитатами - как у поля IDE (draft.utils): «> цитата» строками сверху. */
export const messageText = (quotes: readonly string[], body: string): string =>
  [...quotes.map((quote) => `> ${quote}`), ...(body ? [body] : [])].join('\n')

/** Обратно: строки «> » сверху - цитаты, первая обычная строка кончает их (как реплей IDE). */
export const splitQuotes = (text: string): { quotes: string[]; body: string } => {
  const lines = text.split('\n')
  const quotes: string[] = []

  while (lines[0]?.startsWith('> ')) quotes.push((lines.shift() ?? '').slice(2))

  return { quotes, body: lines.join('\n') }
}

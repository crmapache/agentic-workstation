import { UNUSUAL_LINE_TERMINATORS } from './editor.constants'

/** Необычные переводы строк - обычным: Monaco сам переведёт его в переводы строк файла. */
export const withPlainLineBreaks = (text: string): string =>
  text.replace(UNUSUAL_LINE_TERMINATORS, '\n')

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((part) => typeof part === 'string')

/**
 * Вставка для обработчика Monaco: чужой текст - с настоящими переводами строк, свой из кода
 * IDE (copiedFromCode) - как был: U+2028 внутри строки JSON - часть файла, а не перенос.
 * Остальные поля вставки (курсоры, событие буфера) идут без изменений.
 */
export const plainPastePayload = (payload: unknown, copiedFromCode: string): unknown => {
  if (typeof payload !== 'object' || payload === null) return payload

  const { text, multicursorText } = payload as { text?: unknown; multicursorText?: unknown }

  if (typeof text !== 'string' || text === copiedFromCode) return payload

  return {
    ...payload,
    text: withPlainLineBreaks(text),
    ...(isStrings(multicursorText) && {
      multicursorText: multicursorText.map(withPlainLineBreaks),
    }),
  }
}

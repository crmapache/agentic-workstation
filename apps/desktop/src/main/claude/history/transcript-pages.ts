import { stringField, parseCliLine } from '../cli/cli-messages'
import { PAGE_CUT_REACH } from './history.constants'

/** Окно строк транскрипта для ленты: строки и есть ли что-то выше них. */
export type TranscriptPage = { lines: string[]; hasEarlier: boolean }

/** Строка, которая в ленте даёт своё: сообщение человека, ответ модели, результат вызова. */
const isMessageLine = (line: string) =>
  line.includes('"type":"user"') || line.includes('"type":"assistant"')

/**
 * Строка, перед которой страницу резать можно: строка человека (его сообщение или
 * результат вызова). Блоки одного ответа модели идут подряд строками assistant, и
 * строка user всегда стоит между ответами - разрез перед ней не делит ответ пополам.
 * Без uuid строку не назвать в следующем запросе.
 */
const isCutPoint = (line: string) => {
  if (!line.includes('"type":"user"')) return false

  const message = parseCliLine(line)

  return message?.type === 'user' && stringField(message, 'uuid') !== ''
}

/** Сообщение человека, а не результат вызова: с него начинается ход. */
const isPrompt = (line: string) => isCutPoint(line) && !line.includes('"tool_result"')

/**
 * Начало страницы из count сообщений, кончающейся перед end. Разрез ищется вверх от
 * точки, где набралось count сообщений: сперва сообщение человека (ход целиком), не
 * дальше PAGE_CUT_REACH строк, иначе любая строка человека, иначе как есть.
 */
const pageStart = (lines: readonly string[], end: number, count: number): number => {
  let start = end
  let seen = 0

  while (start > 0 && seen < count) {
    start -= 1
    if (isMessageLine(lines[start] ?? '')) seen += 1
  }

  if (start === 0) return 0

  const floor = Math.max(0, start - PAGE_CUT_REACH)

  for (let index = start; index >= floor; index -= 1) {
    if (isPrompt(lines[index] ?? '')) return index
  }

  for (let index = start; index >= floor; index -= 1) {
    if (isCutPoint(lines[index] ?? '')) return index
  }

  return start
}

/** Есть ли выше start хоть одно сообщение: иначе метке «load earlier» звать нечего. */
const hasMessagesBefore = (lines: readonly string[], start: number) =>
  lines.slice(0, start).some(isMessageLine)

/**
 * Последняя страница транскрипта: count последних сообщений. complete - строки
 * прочитаны с начала файла; иначе выше прочитанного файл продолжается.
 */
export const lastPage = (
  lines: readonly string[],
  count: number,
  complete: boolean,
): TranscriptPage => {
  const start = pageStart(lines, lines.length, count)

  return {
    lines: lines.slice(start),
    hasEarlier: hasMessagesBefore(lines, start) || (!complete && start === 0 && lines.length > 0),
  }
}

/**
 * Страница перед строкой с uuid anchor (самой ранней в ленте). Якоря нет в файле (его
 * отрезал откат) - null: что брать вместо, решает зовущий. through - номер строки, которую
 * страница обязана захватить (прыжок к закреплённому сообщению выше): тогда она тянется
 * вверх до начала хода этой строки, сколько бы сообщений ни набралось.
 */
export const pageBefore = (
  lines: readonly string[],
  anchor: string,
  count: number,
  through = -1,
): TranscriptPage | null => {
  const end = lines.findIndex(
    (line) => line.includes(anchor) && stringField(parseCliLine(line) ?? {}, 'uuid') === anchor,
  )

  if (end === -1) return null
  if (end === 0) return { lines: [], hasEarlier: false }

  const reach = through >= 0 && through < end ? pageStart(lines, through + 1, 1) : end
  const start = Math.min(pageStart(lines, end, count), reach)

  return { lines: lines.slice(start, end), hasEarlier: hasMessagesBefore(lines, start) }
}

/** uuid первой строки страницы: следующий запрос попросит строки раньше неё. */
export const pageAnchor = (lines: readonly string[]): string | null => {
  for (const line of lines) {
    const uuid = stringField(parseCliLine(line) ?? {}, 'uuid')

    if (uuid) return uuid
  }

  return null
}

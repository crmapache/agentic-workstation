/**
 * Верхние поля строки JSON прямо из байтов, без разбора всей строки. Половина байтов
 * транскриптов - строки с выводом инструментов и вложениями (до 11 МБ одна строка), а от
 * них статистике нужны только время, папка и сессия. Перевод мегабайт в строку JS и
 * JSON.parse стоили бы больше, чем всё остальное чтение; здесь строки значений
 * перепрыгиваются поиском кавычки (indexOf - нативный), а разбираются лишь короткие
 * значения нужных ключей.
 *
 * Это не валидатор: на кривой строке ответ - null, строка пропускается.
 */

const QUOTE = 0x22
const BACKSLASH = 0x5c
const OPEN_BRACE = 0x7b
const CLOSE_BRACE = 0x7d
const OPEN_BRACKET = 0x5b
const CLOSE_BRACKET = 0x5d
const COLON = 0x3a
const COMMA = 0x2c
const LETTER_T = 0x74
const LETTER_F = 0x66

/** Где в строке лежит вложенное значение: [start, end) в байтах. */
export type SkeletonRange = { start: number; end: number }

/**
 * Значение верхнего ключа: строка (уже без экранирования), логическое или место вложенного
 * объекта и массива - его можно поискать или разобрать отдельно, не трогая остальную строку.
 */
export type SkeletonValue = string | boolean | SkeletonRange

const isSpace = (byte: number | undefined) =>
  byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d

const skipSpaces = (line: Buffer, at: number): number => {
  let index = at

  while (isSpace(line[index])) index += 1

  return index
}

/** Индекс закрывающей кавычки строки, начатой кавычкой в at; -1 - строка не закрыта. */
export const stringEnd = (line: Buffer, at: number): number => {
  let from = at + 1

  for (;;) {
    const quote = line.indexOf(QUOTE, from)

    if (quote === -1) return -1

    let slashes = 0

    while (line[quote - 1 - slashes] === BACKSLASH) slashes += 1

    // Чётное число обратных слэшей - они экранируют друг друга, а не кавычку.
    if (slashes % 2 === 0) return quote

    from = quote + 1
  }
}

/** Конец вложенного объекта или массива, начатого в at; строки внутри перепрыгиваются. */
const containerEnd = (line: Buffer, at: number): number => {
  let depth = 0
  let index = at

  while (index < line.length) {
    const byte = line[index]

    if (byte === QUOTE) {
      const end = stringEnd(line, index)

      if (end === -1) return -1

      index = end + 1
      continue
    }

    if (byte === OPEN_BRACE || byte === OPEN_BRACKET) depth += 1
    else if (byte === CLOSE_BRACE || byte === CLOSE_BRACKET) {
      depth -= 1

      if (depth === 0) return index + 1
    }

    index += 1
  }

  return -1
}

/** Конец значения, начатого в at (после него - запятая или закрывающая скобка). */
const valueEnd = (line: Buffer, at: number): number => {
  const byte = line[at]

  if (byte === QUOTE) {
    const end = stringEnd(line, at)

    return end === -1 ? -1 : end + 1
  }

  if (byte === OPEN_BRACE || byte === OPEN_BRACKET) return containerEnd(line, at)

  let index = at

  while (index < line.length && line[index] !== COMMA && line[index] !== CLOSE_BRACE) index += 1

  return index
}

/**
 * Значения нужных верхних ключей строки-объекта. Строковые значения разбираются через
 * JSON.parse своего короткого куска (экранирование, юникод), логические - по первой букве,
 * у вложенных - только место; числа не нужны и пропускаются. null - строка не объект или
 * оборвана.
 */
export const readSkeleton = (
  line: Buffer,
  wanted: ReadonlySet<string>,
): Map<string, SkeletonValue> | null => {
  const found = new Map<string, SkeletonValue>()
  let index = skipSpaces(line, 0)

  if (line[index] !== OPEN_BRACE) return null

  index = skipSpaces(line, index + 1)

  if (line[index] === CLOSE_BRACE) return found

  for (;;) {
    if (line[index] !== QUOTE) return null

    const keyEnd = stringEnd(line, index)

    if (keyEnd === -1) return null

    // Ключи транскрипта - латиница без экранирования: latin1 читается без перекодирования.
    const key = line.toString('latin1', index + 1, keyEnd)

    index = skipSpaces(line, keyEnd + 1)

    if (line[index] !== COLON) return null

    const start = skipSpaces(line, index + 1)
    const end = valueEnd(line, start)

    if (end === -1) return null

    if (wanted.has(key)) {
      const first = line[start]

      if (first === QUOTE) found.set(key, JSON.parse(line.toString('utf8', start, end)) as string)
      else if (first === LETTER_T) found.set(key, true)
      else if (first === LETTER_F) found.set(key, false)
      else if (first === OPEN_BRACE || first === OPEN_BRACKET) found.set(key, { start, end })
    }

    index = skipSpaces(line, end)

    if (line[index] === CLOSE_BRACE) return found
    if (line[index] !== COMMA) return null

    index = skipSpaces(line, index + 1)
  }
}

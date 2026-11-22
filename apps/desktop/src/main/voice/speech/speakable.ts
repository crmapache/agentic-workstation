/**
 * Текст ответа для озвучки (spec, «Фильтр перед озвучкой»): поверх голосовой пометки IDE сама
 * убирает то, что вслух звучит мусором, - блоки кода, таблицы, ссылки, разметку Markdown. В
 * чате текст остаётся полным.
 */

const FENCE = /^\s*(```|~~~)/

/** Ссылка Markdown - её подпись; голый адрес - ничего. */
const LINK = /!?\[([^\]]*)\]\([^)]*\)/g
/** Адрес без знака конца фразы за ним: точка после ссылки всё ещё кончает фразу. */
const URL = /\b(?:https?:\/\/|www\.)\S*[^\s.,!?;:)]/g

/** Короткий код в строке читается словом (`pnpm`), длинный или путь - выкидывается. */
const INLINE_CODE = /`([^`]*)`/g
const INLINE_SAYABLE = /^[\p{L}\p{N} ._-]{1,24}$/u

const HEADING = /^\s{0,3}#{1,6}\s+/
const QUOTE = /^\s*>\s?/
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/
const EMPHASIS = /(\*\*|__|\*|_|~~)(?=\S)([\s\S]*?\S)\1/g
const TABLE_ROW = /^\s*\|.*\|\s*$/
const RULE = /^\s*(?:[-*_]\s*){3,}$/

const inline = (line: string): string =>
  line
    .replace(LINK, '$1')
    .replace(URL, '')
    .replace(INLINE_CODE, (_, code: string) => (INLINE_SAYABLE.test(code) ? code : ''))
    .replace(EMPHASIS, '$2')
    .replace(/[*_`#|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:…])/g, '$1')
    .trim()

/**
 * Строки, которые стоит сказать: без кода, таблиц, линий и меток списка. Конец пункта списка
 * без точки - тоже конец фразы: строки возвращаются по одной.
 */
export const speakableLines = (text: string): string[] => {
  const lines: string[] = []
  let inFence = false

  for (const raw of text.split('\n')) {
    if (FENCE.test(raw)) {
      inFence = !inFence
      continue
    }

    if (inFence || TABLE_ROW.test(raw) || RULE.test(raw)) continue

    const line = inline(raw.replace(HEADING, '').replace(QUOTE, '').replace(BULLET, ''))

    if (/[\p{L}\p{N}]/u.test(line)) lines.push(line)
  }

  return lines
}

/** Конец фразы внутри строки: знак конца и пробел. «2.1» и «т.е.» без пробела не режут. */
const SENTENCE_END = /(?<=[.!?…])\s+(?=\S)/

/** Фразы для озвучки из готового куска текста. */
export const speakableSentences = (text: string): string[] =>
  speakableLines(text).flatMap((line) =>
    line
      .split(SENTENCE_END)
      .map((sentence) => sentence.trim())
      .filter(Boolean),
  )

/**
 * Где кончается законченная часть текста, который ещё пишется: после последнего конца фразы
 * или строки вне незакрытого блока кода. Начатая фраза и начатый блок кода ждут.
 */
export const settledEnd = (text: string): number => {
  let inFence = false
  let settled = 0
  let lineStart = 0

  for (let at = 0; at < text.length; at += 1) {
    const char = text[at]

    if (char === '\n') {
      if (FENCE.test(text.slice(lineStart, at))) inFence = !inFence
      if (!inFence) settled = at + 1
      lineStart = at + 1
      continue
    }

    if (!inFence && /[.!?…]/.test(char ?? '') && /\s/.test(text[at + 1] ?? '')) settled = at + 1
  }

  return settled
}

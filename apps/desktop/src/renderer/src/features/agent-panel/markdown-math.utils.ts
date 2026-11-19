import { firstLine, isFenceLine, findLineStart } from './markdown-fences.utils'

/**
 * Формула длиннее этого - не формула, а два случайных доллара далеко друг от друга в
 * тексте про деньги.
 */
const MATH_MAX_CHARS = 2000

/** Сколько строк ищется закрытие `$$`: формула - пара строк, а не остаток ответа. */
const MATH_MAX_LINES = 40

/**
 * Две записи формулы отдельным блоком: `$$…$$` и `\[…\]`. Тело не может держать свой
 * закрывающий разделитель - иначе `$$a$$ and $$b$$` в одной строке стали бы одной
 * формулой «a$$ and $$b».
 */
const MATH_ONE_LINE = /^[ \t]*(?:\$\$((?:(?!\$\$)[^\n])+)\$\$|\\\[((?:(?!\\\])[^\n])+)\\\])[ \t]*$/

/** `$$` или `\[` одни в строке: тело формулы - со следующей. */
const MATH_OPENS = /^[ \t]*(\$\$|\\\[)[ \t]*$/

/** Что что закрывает: `$$` - себя же, `\[` - `\]`. */
const MATH_CLOSES: Readonly<Record<string, RegExp>> = {
  $$: /^[ \t]*\$\$[ \t]*$/,
  '\\[': /^[ \t]*\\\][ \t]*$/,
}

/**
 * Формула в строке: `$…$` (тело не начинается и не кончается пробелом, `\$` внутри -
 * доллар, а не конец) или `\(…\)`.
 */
const INLINE_DOLLAR = /^\$((?:\\\$|[^$\s])(?:(?:\\\$|[^$\n])*(?:\\\$|[^$\s]))?)\$/
const INLINE_PAREN = /^\\\(([^\n]+?)\\\)/

/** Буква или цифра любого алфавита (и подчёркивание) у края - знак, что это не формула. */
const WORD_AT_END = /[\p{L}\p{N}_]$/u
const WORD_AT_START = /^[\p{L}\p{N}_]/u

/** Разметка, у которой нет смысла в LaTeX: доллары легли вокруг текста случайно. */
const MARKUP_INSIDE = /`|\*\*[^*]+\*\*/

/** Формула, прочитанная с начала текста: что съедено и сам LaTeX. */
export type MathMatch = {
  raw: string
  latex: string
}

const fits = (latex: string) => latex.length > 0 && latex.length <= MATH_MAX_CHARS

/**
 * Формула отдельным блоком с начала текста, иначе null. Формула существует только
 * закрытой: недописанная `$$\frac{a}{b` - обычный текст печатающегося ответа, а не
 * сломанная формула, которая мигала бы на каждом кадре. Закрытие ищется вперёд и не
 * дальше пустой строки и забора кода: иначе `$$` проглотил бы блок кода под собой.
 */
export const readMathBlock = (source: string): MathMatch | null => {
  const line = firstLine(source)

  if (!line.includes('$$') && !line.includes('\\[')) return null

  const single = MATH_ONE_LINE.exec(line)

  if (single) {
    const latex = (single[1] ?? single[2] ?? '').trim()

    return fits(latex) ? { raw: line, latex } : null
  }

  const closes = MATH_CLOSES[MATH_OPENS.exec(line)?.[1] ?? '']

  if (!closes) return null

  const lines = source.split('\n')
  const body: string[] = []

  for (let index = 1; index < lines.length && body.length <= MATH_MAX_LINES; index += 1) {
    const next = lines[index] ?? ''

    if (closes.test(next)) {
      const latex = body.join('\n').trim()

      return fits(latex) ? { raw: lines.slice(0, index + 1).join('\n'), latex } : null
    }

    if (next.trim() === '' || isFenceLine(next)) return null

    body.push(next)
  }

  return null
}

/** Где может начаться формула-блок - чтобы абзац над ней остановился. */
export const findMathBlockStart = (source: string) =>
  findLineStart(source, ['$$', '\\['], (line) => MATH_ONE_LINE.test(line) || MATH_OPENS.test(line))

/**
 * Формула в строке с начала текста, иначе null. Правила нарочно строже любого
 * TeX-aware markdown: в ответе про код доллар - это цена, переменная оболочки и
 * шаблонная строка. Поэтому `$…$` не встаёт вплотную к букве или цифре (`$5 and $10`,
 * `a$b$c`), а с кодом или жирным внутри - отказ. `\(…\)` ни с чем не спутать, и правило
 * соседей к нему не применяется. `before` - текст, стоящий перед формулой.
 */
export const readInlineMath = (source: string, before: string): MathMatch | null => {
  const paren = INLINE_PAREN.exec(source)
  const dollar = paren ? null : INLINE_DOLLAR.exec(source)
  const match = paren ?? dollar

  if (!match) return null

  const raw = match[0]
  const latex = (match[1] ?? '').trim()
  const beside =
    dollar !== null && (WORD_AT_END.test(before) || WORD_AT_START.test(source.slice(raw.length)))

  if (beside || MARKUP_INSIDE.test(latex) || !fits(latex)) return null

  return { raw, latex }
}

/** Где ближайший кандидат в формулу внутри строки: `$` или `\(`. */
export const findInlineMathStart = (source: string): number | undefined => {
  const starts = [source.indexOf('$'), source.indexOf('\\(')].filter((index) => index !== -1)

  return starts.length > 0 ? Math.min(...starts) : undefined
}

/**
 * Команда двумя словами для чипа: `pnpm dev`, `sandbox.sh`. Описание модели - целое
 * предложение, на узкой панели оно вытолкнуло бы остальные чипы.
 */
export const commandLabel = (command: string): string => {
  const words = (command.split('\n')[0] ?? '').trim().split(/\s+/).filter(Boolean)
  const [first = '', second = ''] = words
  const name = first.split('/').pop() ?? first

  return second && !second.startsWith('-') ? `${name} ${second}` : name
}

/** Шаг цепочки кончился: `&&` и `||` остаются в конце строки, `;` уходит в перевод строки. */
const STEP_JOINERS = ['&&', '||'] as const

/** Начало слова - тут `#` открывает комментарий, а не стоит внутри слова (`a#b`, `$#`). */
const isWordStart = (text: string, index: number) => index === 0 || /\s/.test(text[index - 1] ?? '')

/**
 * Команда по шагам - строкой на шаг: цепочка через `&&`, `||` и `;` в одну строку читается с
 * трудом. Режется только вне кавычек, скобок и подстановок; `&&` и `||` остаются в конце
 * строки (так оболочка и продолжает команду), `;` становится переводом строки - для оболочки
 * то же самое, поэтому скопированное работает как исходное. Хвост-комментарий не режется: его
 * `;` - часть комментария. Свои переводы строк, heredoc и непарные кавычки - как есть.
 */
export const commandSteps = (command: string): string => {
  const text = command.trim()

  if (text.includes('\n') || text.includes('<<')) return text

  const steps: string[] = []
  let current = ''
  let quote: string | null = null
  let depth = 0

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ''
    const pair = text.slice(index, index + 2)

    if (quote) {
      // В одинарных кавычках обратная косая - просто буква.
      if (char === '\\' && quote !== "'") {
        current += pair
        index += 1
      } else {
        current += char
        if (char === quote) quote = null
      }
    } else if (char === '\\') {
      current += pair
      index += 1
    } else if (char === '"' || char === "'" || char === '`') {
      quote = char
      current += char
    } else if (char === '#' && isWordStart(text, index)) {
      current += text.slice(index)
      break
    } else if (char === '(' || char === '{') {
      depth += 1
      current += char
    } else if ((char === ')' || char === '}') && depth > 0) {
      depth -= 1
      current += char
    } else if (depth > 0) {
      current += char
    } else if (pair === ';;') {
      // Конец ветки case - не шаг цепочки.
      current += pair
      index += 1
    } else if (STEP_JOINERS.some((joiner) => joiner === pair)) {
      steps.push(`${current.trim()} ${pair}`)
      current = ''
      index += 1
    } else if (char === ';') {
      steps.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  if (quote || depth !== 0) return text

  return [...steps, current.trim()].filter(Boolean).join('\n')
}

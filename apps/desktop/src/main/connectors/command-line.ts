/** Окружение для подстановок: переменные оболочки входа человека (HOME в их числе). */
export type ShellVariables = Readonly<Record<string, string>>

/** Имя переменной окружения: буквы, цифры и подчёркивание, не с цифры. */
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

const NAME_START = /[A-Za-z_]/

const NAME_CHAR = /[A-Za-z0-9_]/

/** Переменная не задана в оболочке: подставить нечего, и команда молча запустилась бы не та. */
class UnknownVariable extends Error {}

/**
 * Подстановка «$NAME» или «${NAME}» с позиции index (там «$»): значение и где кончилась
 * запись. Без имени после «$» - не подстановка, знак остаётся как есть.
 */
const readVariable = (
  line: string,
  index: number,
  env: ShellVariables,
): { value: string; end: number } | null => {
  const braced = line[index + 1] === '{'
  let end = index + (braced ? 2 : 1)

  if (!NAME_START.test(line[end] ?? '')) return null

  while (NAME_CHAR.test(line[end] ?? '')) end += 1

  const name = line.slice(index + (braced ? 2 : 1), end)

  if (braced && line[end] !== '}') return null

  const value = env[name]

  if (value === undefined) throw new UnknownVariable(name)

  return { value, end: braced ? end : end - 1 }
}

/** «~» раскрывается в начале слова или значения KEY=, если дальше «/» или конец слова. */
const isHomeTilde = (line: string, index: number, current: string, started: boolean): boolean => {
  const next = line[index + 1] ?? ''
  const atStart = !started || /^[A-Za-z_][A-Za-z0-9_]*=$/.test(current)

  return atStart && (next === '' || next === '/' || /\s/.test(next))
}

/**
 * Строка команды по словам, как её режет оболочка: пробелы делят, кавычки склеивают,
 * обратная косая экранирует знак. С окружением (env) - ещё и подстановки, как в терминале:
 * «~» без кавычек - домашняя папка, $NAME и ${NAME} вне одинарных кавычек - значение
 * переменной. Незакрытая кавычка или неизвестная переменная - null: молча склеенная или
 * недоподставленная команда запустила бы не то.
 */
export const splitCommandLine = (line: string, env?: ShellVariables): string[] | null => {
  const words: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let started = false

  try {
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index] ?? ''
      const variable = env && char === '$' && quote !== "'" ? readVariable(line, index, env) : null

      if (variable) {
        current += variable.value
        started = true
        index = variable.end
      } else if (quote) {
        if (char === quote) quote = null
        else if (char === '\\' && quote === '"' && index + 1 < line.length) current += line[++index]
        else current += char
      } else if (char === '"' || char === "'") {
        quote = char
        started = true
      } else if (char === '\\' && index + 1 < line.length) {
        current += line[++index]
        started = true
      } else if (/\s/.test(char)) {
        if (started) words.push(current)

        current = ''
        started = false
      } else if (env && char === '~' && isHomeTilde(line, index, current, started)) {
        const home = env['HOME']

        if (home === undefined) throw new UnknownVariable('HOME')

        current += home
        started = true
      } else {
        current += char
        started = true
      }
    }
  } catch (error) {
    if (error instanceof UnknownVariable) return null

    throw error
  }

  if (quote) return null

  if (started) words.push(current)

  return words
}

/**
 * Переменные окружения из строки «KEY=value OTHER="a b"» - с теми же подстановками, что у
 * команды. Слово без «=» или с кривым именем - null: человек ошибся, и сервер без ключа
 * молча не заработал бы.
 */
export const parseEnvLine = (line: string, env?: ShellVariables): Record<string, string> | null => {
  const words = splitCommandLine(line, env)

  if (!words) return null

  const entries: [string, string][] = []

  for (const word of words) {
    const split = word.indexOf('=')
    const name = word.slice(0, split)

    if (split <= 0 || !ENV_NAME.test(name)) return null

    entries.push([name, word.slice(split + 1)])
  }

  return Object.fromEntries(entries)
}

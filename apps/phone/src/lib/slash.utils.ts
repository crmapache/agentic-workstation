import type { SlashCommandWire } from '@agentic-workstation/remote-protocol/conversation-wire-types'

/**
 * Подсказка «/» над полем сообщения, как у поля окна IDE и в ACC: по «/» в начале - команды,
 * список сужается по мере набора и уходит, как только строка перестала быть командой; после
 * имени и пробела - значения аргумента (/model, /effort, /fast). Команду можно поставить перед
 * уже написанным: читается начало поля до каретки.
 */

/** Значение аргумента для второго шага (/model opus, /effort high). */
export type SlashOption = { value: string; hint: string }

/** Подсвеченная часть подписи строки: с какого знака и сколько. */
export type SlashMark = { start: number; length: number }

/** Строка подсказки: команда или значение её аргумента. */
export type SlashRow = {
  id: string
  label: string
  description: string
  group: SlashCommandWire['group'] | null
  marks: SlashMark[]
}

/**
 * Что показать над полем: строки, какой это список (команды или значения команды) и его ключ -
 * по нему закрытый крестиком список не встаёт снова, пока набранное не поменялось.
 */
export type SlashState = {
  kind: 'commands' | 'values'
  /** У значений - чьи они (model), у команд - пусто. */
  command: string
  rows: SlashRow[]
  /** Сколько всего в этом списке без сужения. */
  total: number
  key: string
}

/** Команда, которую выполняет сам телефон, и что набрано после её имени. */
export type LocalCommand = { name: string; argument: string }

/** Список листается сам; потолок - от бесконечного списка, а не от полного. */
export const MAX_SUGGESTIONS = 50

/** Что набрано после «/»; пробел - имя кончилось, null - строка уже не про команду. */
export const slashQuery = (head: string): string | null => {
  if (!head.startsWith('/')) return null

  const rest = head.slice(1)

  return /\s/.test(rest) ? null : rest
}

/** Сначала начинающиеся с набранного - это и ищут, набирая первые буквы, потом содержащие. */
export const matchCommands = (
  commands: readonly SlashCommandWire[],
  query: string,
  limit = MAX_SUGGESTIONS,
): SlashCommandWire[] => {
  const needle = query.toLowerCase()

  if (!needle) return commands.slice(0, limit)

  const starts = commands.filter((command) => command.name.toLowerCase().startsWith(needle))
  const contains = commands.filter((command) => {
    const name = command.name.toLowerCase()

    return !name.startsWith(needle) && name.includes(needle)
  })

  return [...starts, ...contains].slice(0, limit)
}

/** Где в подписи набранное: подсветка совпадения, как в списке окна. */
const marksOf = (label: string, query: string, offset: number): SlashMark[] => {
  const at = query ? label.toLowerCase().indexOf(query.toLowerCase(), offset) : -1

  return at < 0 ? [] : [{ start: at, length: query.length }]
}

/** Имя набрано, за ним пробел и значение без пробелов - второй шаг, если значения известны. */
const argumentQuery = (
  head: string,
  argumentSets: Readonly<Record<string, readonly SlashOption[]>>,
): { command: string; query: string; options: readonly SlashOption[] } | null => {
  const match = /^\/([a-z-]+) (\S*)$/.exec(head)
  const command = match?.[1] ?? ''
  const options = argumentSets[command]

  return match && options ? { command, query: match[2] ?? '', options } : null
}

/** Подсказка для начала поля до каретки; null - показывать нечего. */
export const slashState = (
  head: string,
  commands: readonly SlashCommandWire[],
  argumentSets: Readonly<Record<string, readonly SlashOption[]>>,
): SlashState | null => {
  const query = slashQuery(head)

  if (query !== null) {
    const rows = matchCommands(commands, query).map((command): SlashRow => ({
      id: command.name,
      label: `/${command.name}`,
      description: command.hint || command.argumentHint,
      group: command.group,
      marks: marksOf(`/${command.name}`, query, 1),
    }))

    return rows.length > 0
      ? { kind: 'commands', command: '', rows, total: commands.length, key: `/${query}` }
      : null
  }

  const argument = argumentQuery(head, argumentSets)

  if (!argument) return null

  const needle = argument.query.toLowerCase()
  const rows = argument.options
    .filter((option) => option.value.toLowerCase().startsWith(needle))
    .slice(0, MAX_SUGGESTIONS)
    .map((option): SlashRow => ({
      id: option.value,
      label: option.value,
      description: option.hint,
      group: null,
      marks: marksOf(option.value, argument.query, 0),
    }))

  return rows.length > 0
    ? {
        kind: 'values',
        command: argument.command,
        rows,
        total: argument.options.length,
        key: `${argument.command}\u0000${argument.query}`,
      }
    : null
}

/**
 * Команда, которую выполняет телефон, а не CLI: имя из своих (local) и что набрано после него.
 * Вопрос сбоку - проза: переводы строк в нём остаются. Остальное уходит CLI текстом.
 */
export const localCommand = (text: string, local: ReadonlySet<string>): LocalCommand | null => {
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  const name = match?.[1] ?? ''

  if (!match || !local.has(name)) return null

  const rest = (match[2] ?? '').trim()

  return { name, argument: name === 'btw' ? rest : rest.split(/\s+/).join(' ') }
}

import type { SlashCommand } from '@shared/conversation'
import type { CommandHint } from '@shared/message-draft'

import { MAX_SUGGESTIONS, UNAVAILABLE_IN_STREAM, INTERNAL_COMMAND_PREFIX } from './slash.constants'
import type { HeldChoice, CommandEntry, CommandOption } from './slash.types'

/**
 * Подсказка «/» прямо в поле, как в терминале: список сужается по мере набора и
 * исчезает, как только строка перестала быть командой (поведение - как в ACC).
 */

/** Команду можно предложить: CLI в потоке её выполнит, и она не служебная. */
const isOffered = (name: string) =>
  !name.startsWith(INTERNAL_COMMAND_PREFIX) && !UNAVAILABLE_IN_STREAM.has(name)

/**
 * Команды CLI для проекта и свои команды CLI одним списком: проект - в порядке CLI, имя
 * без пояснения (из init или с диска IDE) берёт его и признак своей команды у своей
 * команды CLI; свои, которых проект ещё не назвал (до первого хода), - следом.
 */
export const withBuiltins = (
  project: readonly SlashCommand[],
  builtins: readonly SlashCommand[],
): SlashCommand[] => {
  const known = new Map(builtins.map((command) => [command.name, command]))
  const named = new Set(project.map((command) => command.name))

  return [
    ...project.map((command) =>
      command.description ? command : (known.get(command.name) ?? command),
    ),
    ...builtins.filter((command) => !named.has(command.name)),
  ]
}

/**
 * Каталог по порядку: команды панели, встроенные с пояснениями, команды от CLI (свои -
 * с меткой встроенной), потом найденное на диске и ещё не названное CLI - по имени, чтобы
 * тот же набор файлов не перерисовывал список в другом порядке. Файл с диска важнее
 * своего пояснения.
 */
export const buildCommands = (
  panel: readonly CommandEntry[],
  builtin: readonly CommandEntry[],
  cli: readonly SlashCommand[],
  disk: readonly CommandHint[],
): CommandEntry[] => {
  const hints = new Map(disk.map((hint) => [hint.name, hint]))
  const seen = new Set<string>()
  const entries: CommandEntry[] = []
  const add = (entry: CommandEntry) => {
    if (seen.has(entry.id)) return

    seen.add(entry.id)
    entries.push(entry)
  }

  for (const entry of panel) add(entry)

  for (const entry of builtin) {
    const hint = hints.get(entry.id)

    add({
      ...entry,
      hint: hint?.description || entry.hint,
      argumentHint: hint?.argumentHint || entry.argumentHint,
    })
  }

  for (const command of cli) {
    if (!isOffered(command.name)) continue

    const hint = hints.get(command.name)

    add({
      id: command.name,
      hint: hint?.description || command.description,
      argumentHint: hint?.argumentHint || command.argumentHint || undefined,
      group: command.builtin ? 'built-in' : 'project',
    })
  }

  const onDisk = disk
    .filter((hint) => !seen.has(hint.name) && isOffered(hint.name))
    .map((hint): CommandEntry => ({
      id: hint.name,
      hint: hint.description,
      argumentHint: hint.argumentHint || undefined,
      group: 'project',
    }))
    .sort((one, other) => (one.id < other.id ? -1 : one.id > other.id ? 1 : 0))

  return [...entries, ...onDisk]
}

/** Сначала начинающиеся с набранного - это и ищут, набирая первые буквы. */
export const matchCommands = (
  commands: readonly CommandEntry[],
  query: string,
  limit = MAX_SUGGESTIONS,
): CommandEntry[] => {
  const needle = query.toLowerCase()

  if (!needle) return commands.slice(0, limit)

  const starts = commands.filter((command) => command.id.toLowerCase().startsWith(needle))
  const contains = commands.filter((command) => {
    const name = command.id.toLowerCase()

    return !name.startsWith(needle) && name.includes(needle)
  })

  return [...starts, ...contains].slice(0, limit)
}

/** Значения аргумента, начинающиеся с набранного. */
export const matchArguments = (
  options: readonly CommandOption[],
  query: string,
): CommandOption[] => {
  const needle = query.toLowerCase()

  return options
    .filter((option) => option.id.toLowerCase().startsWith(needle))
    .slice(0, MAX_SUGGESTIONS)
}

/**
 * Какая строка выбрана, когда список под ней меняется: по имени. Исчезло имя - первая
 * строка, её же берёт Enter. Выбор из другого списка (команды против файлов) не в счёт.
 */
export const chosenRow = (
  rows: readonly { id: string }[],
  held: HeldChoice | null,
  list: string,
): number => {
  if (rows.length === 0 || !held || held.list !== list) return 0

  const at = rows.findIndex((row) => row.id === held.id)

  return at < 0 ? 0 : at
}

/** Выбор сделан стрелкой в этом же списке: мышь, проехавшая по списку, ничего не решала. */
export const handPicked = (held: HeldChoice | null, list: string): boolean =>
  held !== null && held.list === list && held.by === 'key'

/**
 * Отправляет ли Enter набранное вместо подстановки. Набранное целиком отправляется, но
 * строка, на которую спустились стрелкой, важнее: иначе горит одна строка, а уходит
 * другая (/task и /task-review).
 */
export const enterSends = (typedInFull: boolean, held: HeldChoice | null, list: string): boolean =>
  typedInFull && !handPicked(held, list)

/** Что набрано после «/»; пробел - имя кончилось, null - строка уже не про команду. */
export const slashQuery = (head: string): string | null => {
  if (!head.startsWith('/')) return null

  const rest = head.slice(1)

  return /\s/.test(rest) ? null : rest
}

/** Имя команды, если за ним пробел и больше ничего: место аргумента ещё пустое. */
export const commandNameBeforeArgument = (head: string): string | null =>
  /^\/(\S+)\s+$/.exec(head)?.[1] ?? null

/** Команда без аргумента бессмысленна: Enter доводит её до подсказки значения. */
export const requiresArgument = (id: string): boolean => id === 'model' || id === 'effort'

import type { CommandEntry } from '@shared/slash-catalog'

import { MAX_SUGGESTIONS } from './slash.constants'
import type { HeldChoice, CommandOption } from './slash.types'

/**
 * Подсказка «/» прямо в поле, как в терминале: список сужается по мере набора и
 * исчезает, как только строка перестала быть командой (поведение - как в ACC).
 */

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

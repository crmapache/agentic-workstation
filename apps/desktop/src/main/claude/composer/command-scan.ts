import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { CommandHint } from '@shared/message-draft'

import { COMMAND_HINT_MAX, COMMANDS_MAX_DEPTH, COMMANDS_MAX_FILES } from './composer.constants'

/**
 * Команды и скиллы с диска - для подсказки «/» ещё до первого сообщения: CLI называет
 * свои только после старта процесса, а человек, только что написавший скилл, ищет его
 * сразу. Порядок полок - старшинство у CLI: проект, свои, плагины; первое имя
 * выигрывает. Подпапка - часть имени через «:», файл без frontmatter - тоже команда.
 */

/** Полка команд: каталог `commands` и каталог `skills`, и приставка имени (плагин). */
export type CommandShelf = { commands: string; skills: string; prefix: string }

/** Строки с отступом сразу под полем - тело `>` и `|`. */
const indentedAfter = (lines: readonly string[], index: number): string[] => {
  const end = lines.findIndex((line, at) => at > index && !/^\s/.test(line))

  return lines.slice(index + 1, end < 0 ? undefined : end)
}

/** Значение поля frontmatter без кавычек; `>` и `|` - строки ниже с отступом. */
const fieldOf = (lines: readonly string[], name: string): string => {
  const index = lines.findIndex((line) => line.startsWith(`${name}:`))
  const line = lines[index]

  if (line === undefined) return ''

  const value = line.slice(name.length + 1).trim()
  const raw = /^[>|][+-]?$/.test(value)
    ? indentedAfter(lines, index)
        .map((part) => part.trim())
        .join(' ')
    : value

  return raw.replace(/^(['"])(.*)\1$/, '$2').slice(0, COMMAND_HINT_MAX)
}

/** Описание и синтаксис аргумента из frontmatter файла. Нет frontmatter - пусто. */
export const parseFrontmatter = (
  content: string,
): { description: string; argumentHint: string } => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  const lines = match?.[1]?.split(/\r?\n/) ?? []

  return {
    description: fieldOf(lines, 'description'),
    argumentHint: fieldOf(lines, 'argument-hint'),
  }
}

type Found = { name: string; file: string }

/** Файлы команд в подпапках до потолка глубины: `a/b/c.md` - «a:b:c». */
const commandFiles = async (dir: string, prefix: string, depth = 0): Promise<Found[]> => {
  if (depth > COMMANDS_MAX_DEPTH) return []

  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(
    entries.map(async (entry): Promise<Found[]> => {
      const file = join(dir, entry.name)

      if (entry.isDirectory()) return commandFiles(file, `${prefix}${entry.name}:`, depth + 1)
      if (entry.isFile() && entry.name.endsWith('.md')) {
        return [{ name: `${prefix}${entry.name.slice(0, -3)}`, file }]
      }

      return []
    }),
  )

  return nested.flat()
}

/** Скиллы: папка со SKILL.md, имя - имя папки. */
const skillFiles = async (dir: string, prefix: string): Promise<Found[]> => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])

  return entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => ({ name: `${prefix}${entry.name}`, file: join(dir, entry.name, 'SKILL.md') }))
}

/** Подсказки с полок по старшинству; повтор имени - мимо, нечитаемый файл - мимо. */
export const scanShelves = async (shelves: readonly CommandShelf[]): Promise<CommandHint[]> => {
  const found: Found[] = []

  for (const shelf of shelves) {
    found.push(...(await commandFiles(shelf.commands, shelf.prefix)))
    found.push(...(await skillFiles(shelf.skills, shelf.prefix)))

    if (found.length >= COMMANDS_MAX_FILES) break
  }

  const seen = new Set<string>()
  const unique = found.slice(0, COMMANDS_MAX_FILES).filter(({ name }) => {
    if (seen.has(name)) return false

    seen.add(name)

    return true
  })
  const hints = await Promise.all(
    unique.map(async ({ name, file }) => {
      const content = await readFile(file, 'utf8').catch(() => null)

      return content === null ? null : { name, ...parseFrontmatter(content) }
    }),
  )

  return hints.filter((hint): hint is CommandHint => hint !== null)
}

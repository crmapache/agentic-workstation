import { stat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { CommandShelf } from '../../claude/composer/command-scan'
import type { AuthorSkill } from './author-instructions'

/** Сколько файлов смотреть: каталог - подсказка, а не инвентаризация диска. */
const MAX_FILES = 300
const MAX_DEPTH = 3

/** Поле frontmatter строкой - без кавычек. */
const fieldOf = (head: string, name: string): string => {
  const line = head.split('\n').find((one) => one.startsWith(`${name}:`))

  return (line?.slice(name.length + 1).trim() ?? '').replace(/^(['"])(.*)\1$/, '$2')
}

/** Как в скилл входят, - по его frontmatter, а не по догадке модели. */
const skillOf = (name: string, file: string, content: string): AuthorSkill => {
  const head = /^---\n([\s\S]*?)\n---/.exec(content)?.[1] ?? ''

  return {
    name,
    description: fieldOf(head, 'description'),
    argumentHint: fieldOf(head, 'argument-hint'),
    modelInvocable: fieldOf(head, 'disable-model-invocation') !== 'true',
    userInvocable: fieldOf(head, 'user-invocable') !== 'false',
    file,
  }
}

const commandFiles = async (
  dir: string,
  prefix: string,
  depth = 0,
): Promise<[string, string][]> => {
  if (depth > MAX_DEPTH) return []

  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const found: [string, string][] = []

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      found.push(...(await commandFiles(path, `${prefix}${entry.name}:`, depth + 1)))
    } else if (entry.name.endsWith('.md')) {
      found.push([`${prefix}${entry.name.slice(0, -3)}`, path])
    }
  }

  return found
}

const skillFiles = async (dir: string, prefix: string): Promise<[string, string][]> => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const found: [string, string][] = []

  for (const entry of entries.filter((one) => one.isDirectory())) {
    const file = join(dir, entry.name, 'SKILL.md')

    if ((await stat(file).catch(() => null))?.isFile()) found.push([`${prefix}${entry.name}`, file])
  }

  return found
}

/** Скиллы и команды полок по старшинству CLI; повтор имени - мимо, нечитаемый файл - мимо. */
export const authorSkills = async (shelves: readonly CommandShelf[]): Promise<AuthorSkill[]> => {
  const files: [string, string][] = []

  for (const shelf of shelves) {
    files.push(...(await commandFiles(shelf.commands, shelf.prefix)))
    files.push(...(await skillFiles(shelf.skills, shelf.prefix)))

    if (files.length >= MAX_FILES) break
  }

  const seen = new Set<string>()
  const unique = files.slice(0, MAX_FILES).filter(([name]) => !seen.has(name) && seen.add(name))
  const read = await Promise.all(
    unique.map(async ([name, file]) => {
      const content = await readFile(file, 'utf8').catch(() => null)

      return content === null ? null : skillOf(name, file, content)
    }),
  )

  return read.flatMap((skill) => (skill ? [skill] : []))
}

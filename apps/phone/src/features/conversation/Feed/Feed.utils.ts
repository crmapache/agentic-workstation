import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'

/**
 * Элемент ленты на проводе - вид (kind) и поля по виду, как их собирает IDE для своей панели
 * (shared/claude-feed.ts). Телефон читает поля осторожно: форма не проверена схемой, и поле,
 * которого нет или оно не того типа, - пусто, а не падение экрана.
 */

export type Fields = Record<string, unknown>

export const text = (item: Fields, key: string): string => {
  const value = item[key]

  return typeof value === 'string' ? value : ''
}

export const count = (item: Fields, key: string): number => {
  const value = item[key]

  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export const flag = (item: Fields, key: string): boolean => item[key] === true

export const fields = (item: Fields, key: string): Fields | null => {
  const value = item[key]

  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : null
}

export const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const list = (item: Fields, key: string): unknown[] => {
  const value = item[key]

  return Array.isArray(value) ? value : []
}

/**
 * Верхний уровень ленты: то, что случилось внутри субагента, IDE прячет в его карточку, а
 * телефон - в число шагов на строке его вызова.
 */
export const topLevel = (items: FeedItemWire[]): FeedItemWire[] =>
  items.filter((item) => typeof item['parentToolUseId'] !== 'string')

/** Сколько шагов внутри каждого вызова субагента: id вызова - число. */
export const innerSteps = (items: FeedItemWire[]): Map<string, number> => {
  const steps = new Map<string, number>()

  for (const item of items) {
    const parent = item['parentToolUseId']

    if (typeof parent === 'string') steps.set(parent, (steps.get(parent) ?? 0) + 1)
  }

  return steps
}

/** Путь коротко: папка и имя файла. Полный путь в строке телефона не влезает. */
export const shortPath = (path: string): string =>
  path.split('/').filter(Boolean).slice(-2).join('/')

/** Имя инструмента для глаз: mcp__server__tool - «server: tool». */
export const toolLabel = (name: string): string => {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name)

  return mcp ? `${mcp[1]}: ${mcp[2]}` : name
}

/** О чём вызов одной строкой: команда, файл, шаблон, адрес - по имени инструмента. */
export const toolSummary = (name: string, input: Fields): string => {
  switch (name) {
    case 'Bash':
      return text(input, 'description') || text(input, 'command')
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      return shortPath(text(input, 'file_path'))
    case 'NotebookEdit':
      return shortPath(text(input, 'notebook_path'))
    case 'Glob':
    case 'Grep':
      return text(input, 'pattern')
    case 'WebFetch':
      return text(input, 'url')
    case 'WebSearch':
      return text(input, 'query')
    case 'Task':
    case 'Agent':
      return text(input, 'description')
    default:
      return Object.values(input).find((value): value is string => typeof value === 'string') ?? ''
  }
}

/** Правка файла итогом: сколько строк добавлено и убрано; null - вызов не правка. */
export const editCounts = (
  name: string,
  input: Fields,
  result: Fields | null,
): { added: number; removed: number } | null => {
  if (!['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(name)) return null

  const counted = result ? fields(result, 'changeCounts') : null

  if (counted) return { added: count(counted, 'added'), removed: count(counted, 'removed') }

  const hunks = result ? list(result, 'patch') : []

  if (hunks.length > 0) {
    let added = 0
    let removed = 0

    for (const hunk of hunks) {
      for (const line of isFields(hunk) ? list(hunk, 'lines') : []) {
        if (typeof line !== 'string') continue
        if (line.startsWith('+')) added += 1
        if (line.startsWith('-')) removed += 1
      }
    }

    return { added, removed }
  }

  if (name === 'Write') return { added: text(input, 'content').split('\n').length, removed: 0 }

  return null
}

/** Подробности вызова для раскрытия: вход читаемо, длинное - обрезано. */
export const inputText = (name: string, input: Fields, limit = 2000): string => {
  const raw = name === 'Bash' ? text(input, 'command') : JSON.stringify(input, null, 2)

  return raw.length > limit ? `${raw.slice(0, limit)}\n…` : raw
}

import { TASK_ID, MESSAGE_ID } from '@agentic-workstation/remote-protocol/command-fields'
import type { FeedView } from '@agentic-workstation/remote-protocol/feed'
import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'

import type { EditCounts, RunningTask } from './Feed.types'

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

/** Вызов субагента, внутри которого случился элемент; null - верхний уровень разговора. */
const parentOf = (item: FeedItemWire): string | null => {
  const parent = item['parentToolUseId']

  return typeof parent === 'string' && parent !== '' ? parent : null
}

/**
 * Строки ленты - как у окна IDE (buildFeedRows): то, что случилось внутри субагента, прячется в
 * число шагов на строке его вызова, но только если сама строка вызова загружена. Шаг без неё
 * (вызов выше загруженного, агент скилла) - обычная строка: иначе лента из одних таких шагов
 * была бы пустой, а «Load earlier» подгружал бы невидимое.
 */
export const topLevel = (items: FeedItemWire[]): FeedItemWire[] => {
  const ids = new Set(items.map((item) => item.id))

  return items.filter((item) => {
    const parent = parentOf(item)

    return parent === null || !ids.has(parent)
  })
}

/** Сколько шагов внутри каждого вызова субагента по загруженным: id вызова - число. */
export const innerSteps = (items: FeedItemWire[]): Map<string, number> => {
  const steps = new Map<string, number>()

  for (const item of items) {
    const parent = parentOf(item)

    if (parent !== null) steps.set(parent, (steps.get(parent) ?? 0) + 1)
  }

  return steps
}

/**
 * Шагов в каждом вызове субагента: счёт IDE по всей её ленте - сами шаги на телефон не идут.
 * IDE постарше счёта не шлёт, а шлёт шаги - тогда по загруженным. Поле не проверено схемой:
 * не число - вызова в счёте нет.
 */
export const stepCounts = (view: Pick<FeedView, 'items' | 'steps'>): Map<string, number> => {
  if (!isFields(view.steps)) return innerSteps(view.items)

  const counts = new Map<string, number>()

  for (const [call, value] of Object.entries(view.steps)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) counts.set(call, value)
  }

  return counts
}

/** Путь коротко: папка и имя файла. Полный путь в строке телефона не влезает. */
export const shortPath = (path: string): string =>
  path.split('/').filter(Boolean).slice(-2).join('/')

const firstLine = (value: string): string => value.split('\n')[0]?.trim() ?? ''

/**
 * Вид действия вызова (ToolActionWire): что вызов делает общими словами всех провайдеров - по
 * нему строка рисуется у любого провайдера. IDE постарше его не шлёт - null, и строка рисуется по
 * имени инструмента Claude Code.
 */
export const actionOf = (item: Fields): Fields | null => {
  const action = fields(item, 'action')

  return action && typeof action['kind'] === 'string' ? action : null
}

/** Имя инструмента для глаз: у MCP - «server: tool» (по виду действия или имени mcp__server__tool). */
export const toolLabel = (name: string, action: Fields | null = null): string => {
  if (action?.['kind'] === 'mcp') return `${text(action, 'server')}: ${text(action, 'tool')}`

  const mcp = /^mcp__(.+?)__(.+)$/.exec(name)

  return mcp ? `${mcp[1]}: ${mcp[2]}` : name
}

/**
 * О чём вызов по виду действия, как цель в шапке окна IDE: файл, шаблон, команда, адрес, агент.
 * null - вид незнакомый (IDE новее телефона): тогда по имени.
 */
const actionSummary = (action: Fields): string | null => {
  const path = shortPath(text(action, 'path'))

  switch (action['kind']) {
    case 'read':
    case 'edit':
    case 'write':
      return path
    case 'search':
      return text(action, 'pattern') || path
    case 'command':
      return text(action, 'description') || firstLine(text(action, 'command'))
    case 'web':
      return text(action, 'target')
    case 'mcp':
    case 'other':
      return text(action, 'target') || path
    case 'skill':
      return [text(action, 'skill'), text(action, 'args')].filter(Boolean).join(' ')
    case 'agent':
      return text(action, 'description') || firstLine(text(action, 'prompt'))
    case 'plan':
      return firstLine(text(action, 'plan'))
    case 'question':
      return list(action, 'questions').find((one): one is string => typeof one === 'string') ?? ''
    case 'todo':
      return ''
    default:
      return null
  }
}

/** О чём вызов одной строкой: по виду действия, у IDE постарше - по имени инструмента. */
export const toolSummary = (name: string, input: Fields, action: Fields | null = null): string => {
  const summary = action ? actionSummary(action) : null

  if (summary !== null) return summary

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

/** Строки записанного файла, как их считает IDE: перевод строки в конце - не лишняя строка. */
const writtenLines = (content: string): number => {
  const trimmed = content.replace(/\n+$/, '')

  return trimmed === '' ? 0 : trimmed.split('\n').length
}

/** Правка ли вызов: по виду действия, у IDE постарше - по имени инструмента Claude Code. */
const isEdit = (name: string, action: Fields | null): boolean =>
  action
    ? action['kind'] === 'edit' || action['kind'] === 'write'
    : ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(name)

/**
 * Правка файла итогом: сколько строк добавлено и убрано или «не посчитать»; null - вызов не
 * правка. Цифры берутся у IDE (changeCounts): она считает по всему диффу и по содержимому
 * нового файла, а готовое число не задевает обрезка дороги до телефона. Свой счёт - пока
 * вызов идёт или IDE цифр не прислала.
 */
export const editCounts = (
  name: string,
  input: Fields,
  result: Fields | null,
  action: Fields | null = null,
): EditCounts | null => {
  if (!isEdit(name, action)) return null
  if (result && flag(result, 'uncounted')) return 'uncounted'

  const counted = result ? fields(result, 'changeCounts') : null
  // IDE по 0.1.19 включительно слала новому файлу «+0 -0» (CLI отдаёт его пустым диффом):
  // строки - по содержимому, как у статистики IDE. Телефон выкладывается отдельно от IDE и
  // застаёт старые.
  const staleCreate =
    counted !== null && result !== null && flag(result, 'created') && count(counted, 'added') === 0

  if (counted && !staleCreate) {
    return { added: count(counted, 'added'), removed: count(counted, 'removed') }
  }

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

  // Новый файл, пока идёт: строки знает вид действия (их посчитала IDE), у старой IDE - вход Write.
  if (action?.['kind'] === 'write') return { added: count(action, 'lines'), removed: 0 }
  if (!action && name === 'Write')
    return { added: writtenLines(text(input, 'content')), removed: 0 }

  return null
}

/** Подробности вызова для раскрытия: команда как есть, остальное - вход читаемо, длинное - обрезано. */
export const inputText = (
  name: string,
  input: Fields,
  action: Fields | null = null,
  limit = 2000,
): string => {
  const command = action
    ? action['kind'] === 'command' && text(action, 'command')
    : name === 'Bash' && text(input, 'command')
  const raw = command === false ? JSON.stringify(input, null, 2) : command

  return raw.length > limit ? `${raw.slice(0, limit)}\n…` : raw
}

/**
 * Идущая задача за вызовом (субагент, флот, фоновая команда): у её задачи CLI итога ещё нет
 * (outcome null). Кончившаяся, без задачи или с id, которого CLI не примет, - null: кнопки
 * «остановить» у такой строки нет.
 */
export const runningTask = (item: Fields): RunningTask | null => {
  const task = fields(item, 'task')

  if (!task || !('outcome' in task) || task['outcome'] !== null) return null

  const taskId = text(task, 'taskId')

  return TASK_ID.safeParse(taskId).success ? { taskId, kind: text(task, 'kind') || 'agent' } : null
}

/**
 * К сообщению человека можно откатиться: оно из транскрипта (id - UUID строки) и начинало ход.
 * Написанное посреди хода и слова панели (auto) хода не начинали - чистого «до» у них нет.
 */
export const canRewind = (item: FeedItemWire): boolean =>
  item.kind === 'user' &&
  MESSAGE_ID.safeParse(item.id).success &&
  !flag(item, 'steering') &&
  !text(item, 'auto')

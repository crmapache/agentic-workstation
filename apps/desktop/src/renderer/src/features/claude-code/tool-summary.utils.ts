import type { ClosedReason, ToolFeedItem } from '@shared/claude-feed'

import type { OpenFileRequest } from '../../state/open-file.context'
import { DETAIL_LIMIT, ANCHOR_MIN_CHARS } from './claude.constants'
import { inputText, relativePath } from './claude.utils'
import type { DiffRow } from './diff.utils'
import { editRows, diffStats } from './diff.utils'

const text = inputText

const firstLine = (value: string) => value.split('\n')[0]?.trim() ?? ''

const countLines = (value: string) => {
  const trimmed = value.replace(/\n+$/, '')

  return trimmed ? trimmed.split('\n').length : 0
}

/** Вызов MCP-инструмента: `mcp__сервер__инструмент` - сервер и имя по отдельности. */
const parseMcpName = (name: string): { server: string; tool: string } | null => {
  const match = /^mcp__(.+?)__(.+)$/.exec(name)

  return match?.[1] && match[2] ? { server: match[1], tool: match[2] } : null
}

/** Имя вызова для людей: у MCP - имя инструмента без служебного префикса. */
export const toolLabel = (name: string): string => parseMcpName(name)?.tool ?? name

/** Инструменты, чей аргумент - один файл: путь в шапке - ссылка на него. */
const FILE_TOOLS = new Set(['Read', 'NotebookRead', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

/** Путь файла вызова (не путь поиска у Grep и Glob): пусто - вызов не про файл. */
const filePathOf = (tool: Pick<ToolFeedItem, 'name' | 'input'>): string =>
  FILE_TOOLS.has(tool.name)
    ? text(tool.input, 'file_path') || text(tool.input, 'notebook_path')
    : ''

/**
 * Цель вызова в шапке, как в ACC: у скилла - имя и аргументы, у файла - путь от корня,
 * у команды - первая строка, дальше шаблон, адрес или запрос, описание; ничего - имя.
 */
export const toolTarget = (tool: Pick<ToolFeedItem, 'name' | 'input'>, root?: string): string => {
  const { name, input } = tool
  const skill = text(input, 'skill')

  if (name === 'Skill' && skill) {
    const args = firstLine(text(input, 'args'))

    return args ? `${skill} ${args}` : skill
  }

  const path = text(input, 'file_path') || text(input, 'notebook_path') || text(input, 'path')

  if (path) return relativePath(path, root)
  if (name === 'Bash' || name === 'BashOutput') return firstLine(text(input, 'command')) || name

  const found =
    text(input, 'pattern') ||
    text(input, 'url') ||
    text(input, 'query') ||
    firstLine(text(input, 'description') || text(input, 'prompt'))

  return found || toolLabel(name)
}

/**
 * Самая длинная добавленная строка правки - по ней будущий редактор найдёт место (CLI
 * номера строки в ответе на правку не даёт). Короткая (скобка, запятая) нашлась бы не
 * там - тогда ничего: верх файла честнее чужой строки.
 */
export const editAnchor = (tool: Pick<ToolFeedItem, 'name' | 'input' | 'result'>): string => {
  const best = editRows(tool)
    .filter((row) => row.kind === 'add')
    .reduce(
      (longest, row) => (row.text.trim().length > longest.length ? row.text.trim() : longest),
      '',
    )

  return best.length >= ANCHOR_MIN_CHARS ? best : ''
}

/** Куда ведёт путь в шапке: файл, у правки - её место, у Read со сдвигом - его строка. */
export const fileTarget = (tool: ToolFeedItem): OpenFileRequest | null => {
  const path = filePathOf(tool)

  if (!path) return null

  const find = tool.status === 'done' && tool.name !== 'Read' ? editAnchor(tool) : ''
  const offset = tool.input['offset']

  if (find) return { path, find }
  if (tool.name === 'Read' && typeof offset === 'number' && offset > 0)
    return { path, line: offset }

  return { path }
}

/** Короткий итог в конце шапки - форма, слова подбирает отрисовка (как ToolMeta в ACC). */
export type ToolMeta =
  | { kind: 'none' }
  | { kind: 'failed' }
  | { kind: 'denied' }
  | { kind: 'lines'; count: number }
  | { kind: 'matches'; count: number }
  | { kind: 'output'; empty: boolean }
  | { kind: 'diff'; added: number; removed: number }
  | { kind: 'uncounted' }
  | { kind: 'closed'; reason: ClosedReason }

/**
 * Итог правки в шапке её карточки: строки по всему диффу CLI, без них - по показанным строкам.
 * Большую правку CLI не сравнивает (`uncounted`) - «±», как в списке файлов хода: «+0 −0»
 * сказало бы, что правка ничего не изменила.
 */
export const editMeta = (result: ToolFeedItem['result'], rows: readonly DiffRow[]): ToolMeta =>
  result?.uncounted
    ? { kind: 'uncounted' }
    : { kind: 'diff', ...(result?.changeCounts ?? diffStats(rows)) }

/** Итог вызова для шапки: цифры - самого вызова. */
export const toolMeta = (tool: ToolFeedItem): ToolMeta => {
  if (tool.status === 'interrupted')
    return { kind: 'closed', reason: tool.closedReason ?? 'turnEnded' }
  if (tool.status === 'denied') return { kind: 'denied' }
  if (tool.status === 'error') return { kind: 'failed' }

  const output = tool.result?.text ?? ''

  if (tool.name === 'Read' || tool.name === 'NotebookRead') {
    const lines = countLines(output)

    return lines > 0 ? { kind: 'lines', count: lines } : { kind: 'none' }
  }

  if (tool.name === 'Grep' || tool.name === 'Glob') {
    return { kind: 'matches', count: countLines(output) }
  }

  if (tool.name === 'Write') {
    const lines = countLines(text(tool.input, 'content'))

    return lines > 0 ? { kind: 'lines', count: lines } : { kind: 'none' }
  }

  if (tool.name === 'Bash') {
    const printed = `${tool.result?.stdout ?? ''}${tool.result?.stderr ?? ''}` || output

    return { kind: 'output', empty: !printed.trim() }
  }

  return { kind: 'none' }
}

/** Строка вывода в раскрытой карточке: тон - по виду строки (✓ - зелёным, ✗ - красным). */
export type DetailLine = { text: string; tone: 'ok' | 'bad' | 'dim' }

const toneOf = (line: string): DetailLine['tone'] => {
  if (/^\s*(✓|✔|PASS|passed\b)/i.test(line)) return 'ok'
  if (/^\s*(✗|✘|FAIL|error\b|Error:)/i.test(line)) return 'bad'

  return 'dim'
}

/**
 * Что вызов напечатал, для раскрытой карточки: первые DETAIL_LIMIT строк и сколько не
 * показано. У команды - stdout, потом stderr (его строки - красным).
 */
export const toolDetail = (tool: ToolFeedItem): { lines: DetailLine[]; hidden: number } => {
  const result = tool.result

  if (!result) return { lines: [], hidden: 0 }

  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  const rows: DetailLine[] =
    stdout || stderr
      ? [
          ...(stdout.trim() ? stdout.replace(/\n+$/, '').split('\n') : []).map((line) => ({
            text: line,
            tone: toneOf(line),
          })),
          ...(stderr.trim() ? stderr.replace(/\n+$/, '').split('\n') : []).map((line) => ({
            text: line,
            tone: 'bad' as const,
          })),
        ]
      : (result.text.trim() ? result.text.replace(/\n+$/, '').split('\n') : []).map((line) => ({
          text: line,
          tone: toneOf(line),
        }))

  return { lines: rows.slice(0, DETAIL_LIMIT), hidden: Math.max(0, rows.length - DETAIL_LIMIT) }
}

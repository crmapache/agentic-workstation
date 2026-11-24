import type { ToolAction, ClosedReason, ToolFeedItem } from '@shared/conversation-feed'

import type { OpenFileRequest } from '../../state/open-file.context'
import type { DiffRow } from './diff.utils'
import { editRows, diffStats } from './diff.utils'
import { DETAIL_LIMIT, ANCHOR_MIN_CHARS } from './panel.constants'
import { relativePath } from './panel.utils'

const firstLine = (value: string) => value.split('\n')[0]?.trim() ?? ''

const countLines = (value: string) => {
  const trimmed = value.replace(/\n+$/, '')

  return trimmed ? trimmed.split('\n').length : 0
}

/** Имя вызова для людей: у MCP - инструмент без сервера, у остальных - имя у провайдера. */
export const toolLabel = (tool: Pick<ToolFeedItem, 'name' | 'action'>): string =>
  tool.action.kind === 'mcp' ? tool.action.tool : tool.name

/** Файл вызова - чтение, правка, новый файл: путь в шапке - ссылка на него. Пусто - не про файл. */
const filePathOf = (action: ToolAction): string =>
  action.kind === 'read' || action.kind === 'edit' || action.kind === 'write' ? action.path : ''

/** Путь от корня проекта, иначе текст цели, иначе имя вызова. */
const pathOrText = (
  tool: Pick<ToolFeedItem, 'name' | 'action'>,
  path: string,
  text: string,
  root?: string,
) => (path ? relativePath(path, root) : text || toolLabel(tool))

/**
 * Цель вызова в шапке, как в ACC: у скилла - имя и аргументы, у файла - путь от корня,
 * у команды - первая строка, у наблюдателя - зачем он (его команда - `tail -F … | grep`), у
 * поиска - папка или шаблон, дальше адрес, запрос, описание; ничего - имя.
 */
export const toolTarget = (tool: Pick<ToolFeedItem, 'name' | 'action'>, root?: string): string => {
  const { action } = tool

  switch (action.kind) {
    case 'skill':
      if (!action.skill) return toolLabel(tool)

      return action.args ? `${action.skill} ${action.args}` : action.skill
    case 'read':
    case 'edit':
    case 'write':
      return pathOrText(tool, action.path, '', root)
    case 'search':
      return pathOrText(tool, action.path, action.pattern, root)
    case 'command':
      return firstLine(action.command) || tool.name
    case 'monitor':
      return firstLine(action.description || action.command || action.url) || tool.name
    case 'web':
      return action.target || toolLabel(tool)
    case 'mcp':
    case 'other':
      return pathOrText(tool, action.path, action.target, root)
    case 'agent':
      return firstLine(action.description || action.prompt) || toolLabel(tool)
    default:
      return toolLabel(tool)
  }
}

/**
 * Самая длинная добавленная строка правки - по ней будущий редактор найдёт место (CLI
 * номера строки в ответе на правку не даёт). Короткая (скобка, запятая) нашлась бы не
 * там - тогда ничего: верх файла честнее чужой строки.
 */
export const editAnchor = (tool: Pick<ToolFeedItem, 'action' | 'result'>): string => {
  const best = editRows(tool)
    .filter((row) => row.kind === 'add')
    .reduce(
      (longest, row) => (row.text.trim().length > longest.length ? row.text.trim() : longest),
      '',
    )

  return best.length >= ANCHOR_MIN_CHARS ? best : ''
}

/** Куда ведёт путь в шапке: файл, у правки - её место, у чтения со сдвигом - его строка. */
export const fileTarget = (tool: ToolFeedItem): OpenFileRequest | null => {
  const { action } = tool
  const path = filePathOf(action)

  if (!path) return null

  const find = tool.status === 'done' && action.kind !== 'read' ? editAnchor(tool) : ''

  if (find) return { path, find }
  if (action.kind === 'read' && action.line !== null) return { path, line: action.line }

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
  const { action } = tool

  if (action.kind === 'read') {
    const lines = countLines(output)

    return lines > 0 ? { kind: 'lines', count: lines } : { kind: 'none' }
  }

  // Поиск без шаблона - список папки (LS): совпадений у него нет.
  if (action.kind === 'search' && action.pattern) {
    return { kind: 'matches', count: countLines(output) }
  }

  if (action.kind === 'write')
    return action.lines > 0 ? { kind: 'lines', count: action.lines } : { kind: 'none' }

  // Команда без текста - служебный вызов вокруг фоновой (вывод опрошен, процесс снят).
  if (action.kind === 'command' && action.command) {
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

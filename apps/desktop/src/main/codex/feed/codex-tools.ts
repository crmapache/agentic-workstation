import type {
  ToolInput,
  ToolAction,
  ToolResult,
  ToolStatus,
  ToolFeedItem,
} from '@shared/conversation-feed'

import type { FileChangeKind } from './codex-diff'
import { hunkCounts, hunksFromDiff } from './codex-diff'

/**
 * Элементы разговора Codex, которые в ленте - вызовы инструментов (ADR 0083): команда,
 * правка файлов, MCP, веб-поиск, субагент, план, просмотр картинки. Вид действия ставится
 * здесь, окно рисует по нему. Остальные элементы (ответ, размышление, сжатие) - не вызовы.
 */

export type CodexItem = Record<string, unknown> & { type: string; id: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

const firstLine = (value: string) => value.split('\n')[0]?.trim() ?? ''

/** Статус элемента Codex - статус вызова в ленте. */
const statusOf = (status: string, failed = false): ToolStatus => {
  if (status === 'inProgress') return 'running'
  if (status === 'declined') return 'denied'
  if (status === 'failed' || status === 'interrupted' || failed) return 'error'

  return 'done'
}

const resultOf = (status: ToolStatus, value: Partial<ToolResult>): ToolResult | null =>
  status === 'running' || status === 'denied'
    ? null
    : { text: '', isError: status === 'error', truncated: false, ...value }

type Base = { parent: string | null; startedAt: number; endedAt: number }

const tool = (
  base: Base,
  id: string,
  name: string,
  input: ToolInput,
  action: ToolAction,
  status: ToolStatus,
  result: ToolResult | null,
): ToolFeedItem => ({
  kind: 'tool',
  id,
  parentToolUseId: base.parent,
  name,
  input,
  action,
  status,
  result,
  startedAt: base.startedAt,
  endedAt: status === 'running' ? 0 : base.endedAt,
  closedReason: null,
})

const commandTool = (item: CodexItem, base: Base): ToolFeedItem => {
  const command = text(item, 'command')
  const output = text(item, 'aggregatedOutput')
  const exitCode = typeof item['exitCode'] === 'number' ? item['exitCode'] : null
  const status = statusOf(text(item, 'status'), exitCode !== null && exitCode !== 0)
  const input = { command, cwd: text(item, 'cwd') }

  return tool(
    base,
    item.id,
    'shell',
    input,
    { kind: 'command', command, description: '' },
    status,
    resultOf(status, { text: output, stdout: output }),
  )
}

/** Правка Codex - по вызову на файл: лента и откат хода живут файлами (id - элемент#номер). */
const fileTools = (item: CodexItem, base: Base): ToolFeedItem[] => {
  const status = statusOf(text(item, 'status'))
  const changes = Array.isArray(item['changes']) ? item['changes'].filter(isRecord) : []

  return changes.map((change, index) => {
    const from = text(change, 'path')
    const shape = isRecord(change['kind']) ? change['kind'] : change
    const raw = isRecord(change['kind']) ? text(shape, 'type') : text(change, 'kind')
    const kind: FileChangeKind = raw === 'add' || raw === 'delete' ? raw : 'update'
    // Перенос (`move_path`): файл теперь там - лента и откат смотрят на новый путь.
    const movePath = text(shape, 'move_path')
    const path = movePath || from
    const created = kind === 'add'
    const hunks = hunksFromDiff(text(change, 'diff'), kind)
    const counts = hunkCounts(hunks)
    const action: ToolAction = created
      ? { kind: 'write', path, preview: hunks, lines: counts.added }
      : { kind: 'edit', path, preview: hunks }

    return tool(
      base,
      `${item.id}#${index}`,
      'apply_patch',
      { path: from, kind, ...(movePath && { movePath }) },
      action,
      status,
      resultOf(status, { patch: hunks, changeCounts: counts, created }),
    )
  })
}

/** Текст ответа MCP: текстовые части содержимого подряд. */
const mcpText = (result: unknown): string =>
  isRecord(result) && Array.isArray(result['content'])
    ? result['content']
        .filter(isRecord)
        .map((part) => text(part, 'text'))
        .filter(Boolean)
        .join('\n')
    : ''

/** Вызов инструмента MCP; он же - вызов из вопроса Codex об одобрении (codex-requests.ts). */
export const mcpTool = (item: CodexItem, base: Base): ToolFeedItem => {
  const server = text(item, 'server')
  const name = text(item, 'tool')
  const args = isRecord(item['arguments']) ? item['arguments'] : {}
  const error = isRecord(item['error']) ? text(item['error'], 'message') : ''
  const status = statusOf(text(item, 'status'), error !== '')
  const target =
    Object.values(args).find((value): value is string => typeof value === 'string') ?? ''

  return tool(
    base,
    item.id,
    `mcp__${server}__${name}`,
    args,
    { kind: 'mcp', server, tool: name, target: firstLine(target), path: '' },
    status,
    resultOf(status, { text: error || mcpText(item['result']) }),
  )
}

const webTool = (item: CodexItem, base: Base): ToolFeedItem => {
  const action = isRecord(item['action']) ? item['action'] : {}
  const target = text(item, 'query') || text(action, 'query') || text(action, 'url')
  const status = statusOf(text(item, 'status') || 'completed')

  return tool(
    base,
    item.id,
    'web_search',
    { query: target },
    { kind: 'web', target },
    status,
    resultOf(status, {}),
  )
}

const agentTool = (item: CodexItem, base: Base): ToolFeedItem => {
  const prompt = text(item, 'prompt')
  const name = text(item, 'tool')
  const status = statusOf(text(item, 'status'))
  const action: ToolAction =
    name === 'spawnAgent'
      ? { kind: 'agent', agent: '', description: firstLine(prompt), prompt, workflow: false }
      : { kind: 'other', target: name, path: '' }

  return tool(base, item.id, name || 'agent', { prompt }, action, status, resultOf(status, {}))
}

/** Вызов ленты из элемента Codex; не вызов (ответ, размышление, сжатие) - пусто. */
export const toolItemsOf = (item: CodexItem, base: Base): ToolFeedItem[] => {
  switch (item.type) {
    case 'commandExecution':
      return [commandTool(item, base)]
    case 'fileChange':
      return fileTools(item, base)
    case 'mcpToolCall':
      return [mcpTool(item, base)]
    case 'webSearch':
      return [webTool(item, base)]
    case 'collabAgentToolCall':
      return [agentTool(item, base)]
    case 'imageView': {
      const path = text(item, 'path')

      return [
        tool(
          base,
          item.id,
          'view_image',
          { path },
          { kind: 'read', path, line: null },
          'done',
          resultOf('done', {}),
        ),
      ]
    }
    case 'plan': {
      const plan = text(item, 'text')

      return [
        tool(base, item.id, 'plan', { plan }, { kind: 'plan', plan }, 'done', resultOf('done', {})),
      ]
    }
    case 'dynamicToolCall': {
      const name = text(item, 'tool')
      const status = statusOf(text(item, 'status'), item['success'] === false)

      return [
        tool(
          base,
          item.id,
          name,
          {},
          { kind: 'other', target: name, path: '' },
          status,
          resultOf(status, {}),
        ),
      ]
    }
    default:
      return []
  }
}

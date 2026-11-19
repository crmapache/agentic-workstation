import { join, isAbsolute } from 'node:path'

import { extensionOf, isNotAuthoredCommand } from '../transcripts/edit-lines'
import type { EditFact } from '../transcripts/line-facts'
import { hunkCounts, hunksFromDiff } from '../../codex/feed/codex-diff'
import type { FileChangeKind } from '../../codex/feed/codex-diff'

/**
 * Что статистика берёт из строк журнала Codex (`$CODEX_HOME/sessions/**\/rollout-*.jsonl`).
 * Формат снят с журналов Codex 0.163-0.167 (2026-11): `session_meta`, `turn_context`,
 * `token_usage_record` с расходом каждого ответа API, `event_msg` (`task_started`,
 * `item_completed` с готовыми действиями - команда, правка файлов, MCP, веб-поиск) и
 * `response_item` (то, что видит модель). Старые журналы (до `item_completed` и
 * `token_usage_record`) несут только `response_item`, `event_msg/token_count` и
 * `event_msg/user_message` - их разбор здесь же. Каждое поле читается с проверкой типа:
 * формат меняется версиями, незнакомое пропускается, не роняя проход.
 */

export type Json = Record<string, unknown>

export const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const text = (record: Json | undefined, key: string): string =>
  typeof record?.[key] === 'string' ? record[key] : ''

const count = (record: Json, key: string): number => {
  const value = record[key]

  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** Расход ответа в смысле статистики: input - только свежий вход, кеш - отдельно. */
export type CodexUsage = { input: number; output: number; cacheRead: number; cacheWrite: number }

/**
 * Расход ответа Codex. У OpenAI `input_tokens` - весь вход, вместе с прочитанным и записанным
 * кешем, а у Claude (и в таблицах статистики) input - только свежий вход: кеш вычитается, иначе
 * доля кеша и стоимость считались бы по-разному у двух провайдеров. Выход уже несёт
 * рассуждения (`reasoning_output_tokens` - его часть), как и у Claude. Пустой - null.
 */
export const codexUsageOf = (usage: unknown): CodexUsage | null => {
  if (!isRecord(usage)) return null

  const cacheRead = count(usage, 'cached_input_tokens')
  const cacheWrite = count(usage, 'cache_write_input_tokens')
  const fact = {
    input: Math.max(0, count(usage, 'input_tokens') - cacheRead - cacheWrite),
    output: count(usage, 'output_tokens'),
    cacheRead,
    cacheWrite,
  }

  return fact.input + fact.output + fact.cacheRead + fact.cacheWrite > 0 ? fact : null
}

/** Вызов инструмента: имя - как в ленте панели Codex (codex-tools.ts), MCP - с сервером. */
export type CodexToolFact = { tool: string; server: string | null; skipEdits: boolean }

const call = (tool: string, server: string | null = null, skipEdits = false): CodexToolFact => ({
  tool,
  server,
  skipEdits,
})

const mcp = (server: string, tool: string): CodexToolFact => call(`mcp__${server}__${tool}`, server)

/** Команда - строкой: у Codex это и строка, и argv (`["/bin/zsh", "-lc", "git status"]`). */
const commandText = (value: unknown): string =>
  Array.isArray(value)
    ? value.filter((part): part is string => typeof part === 'string').join(' ')
    : typeof value === 'string'
      ? value
      : ''

/** Готовое действие (`item_completed`) - вызовом; ответ, размышление, сжатие - не вызовы. */
export const itemToolOf = (item: Json): CodexToolFact | null => {
  switch (item['type']) {
    case 'CommandExecution':
      return call('shell', null, isNotAuthoredCommand(commandText(item['command'])))
    case 'FileChange':
      return call('apply_patch')
    case 'McpToolCall':
      return mcp(text(item, 'server'), text(item, 'tool'))
    case 'WebSearch':
      return call('web_search')
    case 'Extension': {
      // Встроенные расширения Codex: `web.search` - веб-поиск, остальные - своим именем.
      const kind = text(item, 'kind')

      return kind ? call(kind === 'web.search' ? 'web_search' : kind) : null
    }
    case 'ImageView':
      return call('view_image')
    case 'Plan':
      return call('plan')
    case 'CollabAgentToolCall':
    case 'DynamicToolCall':
      return call(text(item, 'tool') || 'agent')
    default:
      return null
  }
}

const editFact = (path: string, added: number, removed: number): EditFact => ({
  path,
  ext: extensionOf(path),
  tool: 'apply_patch',
  added,
  removed,
})

/** Правка одного файла: вид, путь (после переноса - новый) и текст или дифф. */
const changeOf = (path: string, change: Json): EditFact | null => {
  const shape = isRecord(change['kind']) ? change['kind'] : change
  const raw = text(shape, 'type') || text(change, 'kind')
  const kind: FileChangeKind = raw === 'add' || raw === 'delete' ? raw : 'update'
  const body = text(change, 'unified_diff') || text(change, 'diff') || text(change, 'content')
  const target = text(shape, 'move_path') || path
  const lines = hunkCounts(hunksFromDiff(body, kind))

  return target ? editFact(target, lines.added, lines.removed) : null
}

/**
 * Правки готового `FileChange`: по файлу. Журнал держит их картой путь → `{type, content |
 * unified_diff, move_path}`, протокол app-server - списком `{path, kind, diff}`; читаются оба.
 * Неуспешная или отклонённая правка ничего не правила.
 */
export const itemEditsOf = (item: Json): EditFact[] => {
  if (item['type'] !== 'FileChange' || item['status'] !== 'completed') return []

  const changes = item['changes']
  const entries: [string, Json][] = Array.isArray(changes)
    ? changes.filter(isRecord).map((change) => [text(change, 'path'), change])
    : isRecord(changes)
      ? Object.entries(changes).flatMap(([path, change]) =>
          isRecord(change) ? [[path, change] as [string, Json]] : [],
        )
      : []

  return entries.flatMap(([path, change]) => changeOf(path, change) ?? [])
}

/** Текст сообщения человека: текстовые части подряд; только картинка - тоже сообщение. */
export const userTextOf = (content: unknown): string => {
  const parts = Array.isArray(content) ? content.filter(isRecord) : []
  const said = parts
    .map((part) => text(part, 'text'))
    .filter(Boolean)
    .join('\n')

  if (said) return said

  return parts.some((part) => /image/i.test(text(part, 'type'))) ? '[image]' : ''
}

/** Встроенные инструменты старого Codex, которые в ленте зовутся иначе. */
const LEGACY_NAMES: Readonly<Record<string, string>> = {
  'container.exec': 'shell',
  exec_command: 'shell',
  local_shell: 'shell',
  update_plan: 'plan',
}

const PATCH_START = '*** Begin Patch'
const PATCH_END = '*** End Patch'

/** Текст apply_patch внутри команды оболочки (`apply_patch <<'EOF' ... EOF`) или пусто. */
const patchInside = (command: string): string => {
  const start = command.indexOf(PATCH_START)
  const end = command.indexOf(PATCH_END, start)

  return start === -1 || end === -1 ? '' : command.slice(start, end + PATCH_END.length)
}

const parseArguments = (raw: unknown): Json => {
  if (isRecord(raw)) return raw
  if (typeof raw !== 'string') return {}

  try {
    const value: unknown = JSON.parse(raw)

    return isRecord(value) ? value : {}
  } catch {
    return {}
  }
}

/** Вызов из `response_item` старого журнала и текст правки, если это apply_patch. */
export type LegacyCall = { id: string; tool: CodexToolFact; patch: string }

/**
 * Вызов модели в старом журнале: `function_call` (оболочка, MCP - `<сервер>__<инструмент>` или
 * пространство `mcp__<сервер>`), `custom_tool_call` (apply_patch текстом), `local_shell_call`,
 * `web_search_call`. Codex сам перехватывает apply_patch, вызванный через оболочку, - это тоже
 * правка, а не команда.
 */
export const legacyCallOf = (payload: Json): LegacyCall | null => {
  const type = text(payload, 'type')
  const id = text(payload, 'call_id') || text(payload, 'id')
  const name = text(payload, 'name')

  if (!id) return null
  if (type === 'web_search_call') return { id, tool: call('web_search'), patch: '' }
  if (type === 'custom_tool_call') {
    const patch = name === 'apply_patch' ? text(payload, 'input') : ''

    return name ? { id, tool: call(name), patch } : null
  }

  const args =
    type === 'local_shell_call' ? (isRecord(payload['action']) ? payload['action'] : {}) : null

  if (type !== 'function_call' && !args) return null

  const input = args ?? parseArguments(payload['arguments'])
  const namespace = text(payload, 'namespace')

  if (namespace.startsWith('mcp__')) {
    return { id, tool: mcp(namespace.slice('mcp__'.length), name), patch: '' }
  }

  const split = name.indexOf('__')

  if (split > 0) return { id, tool: mcp(name.slice(0, split), name.slice(split + 2)), patch: '' }
  if (name === 'apply_patch') {
    return { id, tool: call('apply_patch'), patch: text(input, 'input') || text(input, 'patch') }
  }

  const tool = args ? 'shell' : (LEGACY_NAMES[name] ?? name)

  if (!tool) return null

  const command = commandText(input['command'] ?? input['cmd'])
  const patch = tool === 'shell' ? patchInside(command) : ''

  return patch
    ? { id, tool: call('apply_patch'), patch }
    : { id, tool: call(tool, null, tool === 'shell' && isNotAuthoredCommand(command)), patch }
}

const FILE_HEAD = /^\*\*\* (Add|Update|Delete) File: (.+)$/
const MOVE_HEAD = /^\*\*\* Move to: (.+)$/

/**
 * Строки правки по тексту apply_patch: у нового файла - его строки «+», у изменения - «+» и
 * «-» кусков. У удаления текста файла в правке нет - строк не посчитать, его нет и в счёте.
 * Путь - полный: apply_patch пишет его и от папки разговора.
 */
export const patchEditsOf = (patch: string, cwd: string): EditFact[] => {
  const edits: EditFact[] = []
  let current: EditFact | null = null

  for (const line of patch.split('\n')) {
    const head = FILE_HEAD.exec(line)
    const move = MOVE_HEAD.exec(line)

    if (head) {
      const path = head[2]?.trim() ?? ''

      current = editFact(cwd && !isAbsolute(path) ? join(cwd, path) : path, 0, 0)
      edits.push(current)
    } else if (move && current) {
      const path = move[1]?.trim() ?? ''

      current.path = cwd && !isAbsolute(path) ? join(cwd, path) : path
      current.ext = extensionOf(current.path)
    } else if (current && !line.startsWith('***')) {
      if (line.startsWith('+')) current.added += 1
      else if (line.startsWith('-')) current.removed += 1
    }
  }

  return edits.filter((edit) => edit.path && edit.added + edit.removed > 0)
}

/** Сообщение apply_patch об успехе - одно во всех версиях Codex. */
const PATCH_SUCCESS = 'Success. Updated the following files'

/** Удалась ли правка по выводу вызова (строка, JSON-строка или части `input_text`). */
export const patchSucceeded = (output: unknown): boolean => {
  const said = Array.isArray(output)
    ? output
        .filter(isRecord)
        .map((part) => text(part, 'text'))
        .join('\n')
    : typeof output === 'string'
      ? output
      : isRecord(output)
        ? text(output, 'output') || text(output, 'content')
        : ''

  return said.includes(PATCH_SUCCESS)
}

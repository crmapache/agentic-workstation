import { join, isAbsolute } from 'node:path'

import { keyOf } from '../stats-keys'
import { editLines, extensionOf, isNotAuthoredCommand } from '../transcripts/edit-lines'
import { isMachineText } from '../transcripts/line-facts'
import type { LinePlace, ParsedRows } from '../transcripts/parsed-rows'
import { emptyRows } from '../transcripts/parsed-rows'
import { writtenLines } from '../../agents/changes/line-counts'
import { hunkCounts, hunksOfUnifiedDiff } from '../../agents/feed/unified-diff'
import { openCodeToolName } from '../../opencode/feed/opencode-tools'

/**
 * Сообщение разговора из базы OpenCode 2.3.x (`session_message`): тип, время и JSON `data`.
 * Части ответа (текст, размышление, вызовы инструментов) лежат в `data.content`, расход и
 * стоимость - в `data.tokens` и `data.cost`, модель - `data.model.id`. Вход в `tokens.input` -
 * уже без кеша, как у Claude. Разбор без ввода-вывода: его проверяют тесты на синтетических
 * сообщениях.
 */
export type OpenCodeMessage = {
  id: string
  type: string
  /** Корневая сессия: у субагента - сессия, которая его позвала. */
  session: string
  subagent: boolean
  /** Папка сессии - проект записей. */
  cwd: string
  created: number
  updated: number
  data: Record<string, unknown>
}

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Json | undefined, key: string): string =>
  typeof record?.[key] === 'string' ? record[key] : ''

const count = (record: Json | undefined, key: string): number => {
  const value = record?.[key]

  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

const recordOf = (value: unknown): Json => (isRecord(value) ? value : {})

/**
 * Встроенные инструменты OpenCode (opencode-tools.ts). Остальное с `_` в имени - MCP:
 * `<сервер>_<инструмент>`. Имён серверов статистика не знает (их знает процесс разговора),
 * поэтому сервер - до первого `_`: у коннекторов IDE в именах `_` нет.
 */
const BUILT_IN = new Set([
  'read',
  'edit',
  'write',
  'shell',
  'glob',
  'grep',
  'list',
  'patch',
  'multiedit',
  'webfetch',
  'websearch',
  'codesearch',
  'subagent',
  'question',
  'todowrite',
  'todoread',
  'skill',
  'batch',
  'invalid',
  'execute',
])

/** Встроенные с `_` в имени - не MCP. */
const BUILT_IN_PREFIXES = ['lsp_', 'plan_']

const toolOf = (name: string): { tool: string; server: string | null } => {
  const tool = openCodeToolName(name)
  const split = tool.indexOf('_')
  const builtIn = BUILT_IN.has(tool) || BUILT_IN_PREFIXES.some((prefix) => tool.startsWith(prefix))

  if (builtIn || split <= 0) return { tool, server: null }

  const server = tool.slice(0, split)

  return { tool: `mcp__${server}__${tool.slice(split + 1)}`, server }
}

/**
 * Вызовы коннекторов изнутри кода Code Mode (`execute`, ADR 0088): `metadata.toolCalls` итога,
 * `<сервер>.<инструмент>` - сервер до первой точки (в именах коннекторов точек нет). Поиск
 * инструментов и `fetch` - не коннекторы.
 */
const codeModeCallsOf = (state: Json): { tool: string; server: string }[] => {
  const calls = recordOf(state['metadata'])['toolCalls']

  return (Array.isArray(calls) ? calls.filter(isRecord) : []).flatMap((call) => {
    const name = text(call, 'tool')
    const split = name.indexOf('.')

    if (split <= 0) return []

    const server = name.slice(0, split)

    return [{ tool: `mcp__${server}__${name.slice(split + 1)}`, server }]
  })
}

/** Путь полным: OpenCode пишет его и от папки сессии. */
const fullPath = (path: string, cwd: string) =>
  path && cwd && !isAbsolute(path) ? join(cwd, path) : path

type FileLines = { path: string; added: number; removed: number }

/**
 * Строки правки по файлу. Главный источник - итог вызова (`metadata.files[]`: путь, дифф,
 * сколько добавлено и удалено); нет его - по входу: `edit` - разность старого и нового куска,
 * `write` - строки нового файла.
 */
const fileLinesOf = (name: string, state: Json, cwd: string): FileLines[] => {
  const metadata = recordOf(state['metadata'])
  const input = recordOf(state['input'])
  const files = (Array.isArray(metadata['files']) ? metadata['files'] : []).filter(isRecord)

  if (files.length > 0) {
    return files.map((file) => {
      const lines =
        typeof file['additions'] === 'number' || typeof file['deletions'] === 'number'
          ? { added: count(file, 'additions'), removed: count(file, 'deletions') }
          : hunkCounts(hunksOfUnifiedDiff(text(file, 'patch')))

      return { path: fullPath(text(file, 'file') || text(file, 'relativePath'), cwd), ...lines }
    })
  }

  const path = fullPath(text(input, 'path') || text(input, 'filePath'), cwd)

  if (name === 'write') return [{ path, added: writtenLines(text(input, 'content')), removed: 0 }]
  if (name === 'edit') {
    return [{ path, ...editLines(text(input, 'oldString'), text(input, 'newString')) }]
  }

  return []
}

/** Инструменты, чей успешный вызов правит файлы. */
const EDITING = new Set(['edit', 'write', 'patch', 'multiedit'])

const answerOf = (message: OpenCodeMessage, place: LinePlace, rows: ParsedRows) => {
  const tokens = recordOf(message.data['tokens'])
  const cache = recordOf(tokens['cache'])
  const model = recordOf(message.data['model'])
  const fact = {
    input: count(tokens, 'input'),
    // OpenCode 2.3 пишет в output только видимый выход (весь выход минус размышления), а
    // размышления - отдельно; у Claude и Codex они - часть выхода, и здесь их складываем.
    output: count(tokens, 'output') + count(tokens, 'reasoning'),
    cacheRead: count(cache, 'read'),
    cacheWrite: count(cache, 'write'),
  }

  if (fact.input + fact.output + fact.cacheRead + fact.cacheWrite === 0) return

  rows.answers.push({
    ...place,
    ...fact,
    id: message.id,
    key: keyOf(`opencode\n${message.id}`),
    model: text(model, 'id') || 'unknown',
    cacheWrite1h: 0,
    fast: false,
    subagent: message.subagent,
    cost: count(message.data, 'cost'),
  })
}

const toolsOf = (message: OpenCodeMessage, place: LinePlace, rows: ParsedRows) => {
  const parts = Array.isArray(message.data['content']) ? message.data['content'] : []

  for (const part of parts.filter(isRecord)) {
    const id = text(part, 'id')
    const name = text(part, 'name') || text(part, 'tool')

    if (part['type'] !== 'tool' || !id || !name) continue

    const state = recordOf(part['state'])
    const input = recordOf(state['input'])
    const { tool, server } = toolOf(name)
    const at = count(recordOf(part['time']), 'created') || place.ts
    const key = `opencode\n${message.id}\n${id}`

    rows.toolCalls.push({
      ...place,
      ts: at,
      key: keyOf(key),
      tool,
      server,
      skipEdits: tool === 'shell' && isNotAuthoredCommand(text(input, 'command')),
      subagent: message.subagent,
    })
    codeModeCallsOf(state).forEach((call, index) =>
      rows.toolCalls.push({
        ...place,
        ts: at,
        key: keyOf(`${key}\n${index}`),
        ...call,
        skipEdits: false,
        subagent: message.subagent,
      }),
    )

    if (!EDITING.has(tool) || state['status'] !== 'completed') continue

    for (const file of fileLinesOf(tool, state, place.cwd)) {
      if (!file.path || file.added + file.removed === 0) continue

      rows.edits.push({
        ...place,
        ts: at,
        key: keyOf(`${key}\n${file.path}`),
        tool,
        ext: extensionOf(file.path),
        fileHash: keyOf(file.path),
        added: file.added,
        removed: file.removed,
        subagent: message.subagent,
      })
    }
  }
}

/** Текст сообщения человека: поле `text`, у старых версий - текстовые части. */
const userTextOf = (data: Json): string => {
  const said = text(data, 'text')

  if (said) return said

  const parts = Array.isArray(data['content']) ? data['content'].filter(isRecord) : []

  return parts.map((part) => text(part, 'text')).join('\n')
}

/**
 * Записи одного сообщения. Человек - сообщение `user` (у субагента его нет: задание пишет
 * родитель); ответ модели и сжатие - расход со стоимостью OpenCode и отрезок активности от
 * начала до конца сообщения; вызовы - части ответа. Команда «!» человека (`shell`) и отметки
 * хода (`idle`) - не работа агента.
 */
export const openCodeRowsOf = (message: OpenCodeMessage): ParsedRows => {
  const rows = emptyRows()
  const time = recordOf(message.data['time'])
  const created = count(time, 'created') || message.created
  const place: LinePlace = { ts: created, cwd: message.cwd, session: message.session }

  if (message.type === 'user') {
    const said = userTextOf(message.data)

    if (!message.subagent && said.trim() !== '') {
      rows.prompts.push({
        ...place,
        key: keyOf(`opencode\n${message.id}`),
        human: !isMachineText(said),
      })
    }

    return rows
  }

  if (message.type !== 'assistant' && message.type !== 'compaction') return rows

  answerOf(message, place, rows)
  toolsOf(message, place, rows)

  const end = Math.max(count(time, 'completed') || message.updated, created)

  rows.spans.push({ start: created, end, cwd: message.cwd, session: message.session })

  return rows
}

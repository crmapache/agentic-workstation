import type { ToolInput, ToolAction, ToolStatus, ToolFeedItem } from '@shared/conversation-feed'

/**
 * Code Mode OpenCode (ADR 0088): инструменты коннекторов модель зовёт не прямыми вызовами, а
 * кодом внутри одного инструмента `execute` - `await tools["gmail-personal"]["search_threads"]
 * ({...})`, найдя их перед тем через `search(...)`. Пространство имён в коде - имя сервера.
 * Что код сделал, OpenCode 2.3.2 пишет в `metadata.toolCalls` хода и итога вызова:
 * `{tool: "<сервер>.<инструмент>" | "search" | "fetch", status, input}` (снято вживую).
 */
export const CODE_MODE_TOOL = 'execute'

/** Вызов коннектора внутри кода: сервер, инструмент, вход и чем кончился. */
export type CodeModeCall = {
  server: string
  tool: string
  input: ToolInput
  status: 'running' | 'completed' | 'error'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

const firstLine = (value: string) => value.split('\n')[0]?.trim() ?? ''

/** Вызов MCP строкой ленты: цель - начало входа, как у прямого вызова. */
export const mcpCallAction = (
  server: string,
  tool: string,
  input: ToolInput | null,
): ToolAction => ({
  kind: 'mcp',
  server,
  tool,
  target: input ? firstLine(JSON.stringify(input)).slice(0, 80) : '',
  path: '',
})

/** Доступ к свойству с начала строки: `.имя` или `["имя"]` - имя и сколько символов он занял. */
const accessOf = (rest: string): { name: string; length: number } | null => {
  const dot = /^\s*\.\s*([A-Za-z_$][\w$]*)/.exec(rest)

  if (dot?.[1]) return { name: dot[1], length: dot[0].length }

  const bracket = /^\s*\[\s*(["'`])([^"'`]*)\1\s*\]/.exec(rest)

  return bracket?.[2] ? { name: bracket[2], length: bracket[0].length } : null
}

/** Вызовы коннекторов по тексту кода: `tools.<сервер>.<инструмент>` в любой записи доступа. */
export const codeCallsOf = (
  code: string,
  servers: readonly string[],
): { server: string; tool: string }[] =>
  [...code.matchAll(/(?<![\w$.])tools\b/g)].flatMap((match) => {
    const rest = code.slice(match.index + match[0].length)
    const server = accessOf(rest)

    if (!server || !servers.includes(server.name)) return []

    const tool = accessOf(rest.slice(server.length))

    return tool ? [{ server: server.name, tool: tool.name }] : []
  })

const callsOf = (metadata: unknown): Record<string, unknown>[] => {
  const calls = isRecord(metadata) ? metadata['toolCalls'] : null

  return Array.isArray(calls) ? calls.filter(isRecord) : []
}

/**
 * Вызовы коннекторов из `metadata.toolCalls`: сервер - известное имя перед точкой (длинные
 * первыми); поиск инструментов и `fetch` - не коннекторы.
 */
export const codeModeCalls = (metadata: unknown, servers: readonly string[]): CodeModeCall[] => {
  const known = [...servers].sort((left, right) => right.length - left.length)

  return callsOf(metadata).flatMap((call) => {
    const name = text(call, 'tool')
    const server = known.find((candidate) => name.startsWith(`${candidate}.`))
    const status = text(call, 'status')

    if (!server) return []

    return [
      {
        server,
        tool: name.slice(server.length + 1),
        input: isRecord(call['input']) ? call['input'] : {},
        status: status === 'completed' || status === 'error' ? status : 'running',
      },
    ]
  })
}

/** Адрес первого `fetch` кода: из хода вызова, иначе по тексту. */
const fetchedOf = (code: string, metadata: unknown): string => {
  const call = callsOf(metadata).find((one) => text(one, 'tool') === 'fetch')
  const input = call && isRecord(call['input']) ? call['input'] : {}

  return text(input, 'url') || (/\bfetch\s*\(\s*(["'`])([^"'`]+)\1/.exec(code)?.[2] ?? '')
}

/**
 * Вид строки `execute`: первый вызов коннектора (из хода, иначе по коду), иначе запрос `fetch`.
 * Код, который только ищет инструменты, - служебный, как ToolSearch у Claude: в ленте его нет.
 */
export const codeModeAction = (
  input: ToolInput,
  metadata: unknown,
  servers: readonly string[],
): ToolAction => {
  const code = text(input, 'code')
  const [called] = codeModeCalls(metadata, servers)
  const [written] = codeCallsOf(code, servers)

  if (called) return mcpCallAction(called.server, called.tool, called.input)
  if (written) return mcpCallAction(written.server, written.tool, null)

  const fetched = fetchedOf(code, metadata)

  if (fetched) return { kind: 'web', target: fetched }

  return /(?<![\w$])search\s*\(/.test(code)
    ? { kind: 'todo' }
    : { kind: 'other', target: firstLine(code).slice(0, 80), path: '' }
}

const statusOf = (call: CodeModeCall, ended: boolean): ToolStatus => {
  if (call.status === 'completed') return 'done'
  if (call.status === 'error') return 'error'

  // Код кончился, а вызов так и не ответил - его оборвал конец кода.
  return ended ? 'interrupted' : 'running'
}

/**
 * Строки ленты одного `execute`: сама строка вызова - первым вызовом коннектора, каждый
 * следующий - своей строкой `<id>#<n>` с входом и исходом этого вызова (как `patch` на
 * несколько файлов). Итог кода - у первой строки; endedAt - код кончился, 0 - идёт.
 */
export const codeModeRows = (
  tool: ToolFeedItem,
  metadata: unknown,
  servers: readonly string[],
  endedAt: number,
): ToolFeedItem[] => {
  const [first, ...others] = codeModeCalls(metadata, servers)

  if (!first) return [tool]

  const ended = endedAt > 0

  return [
    { ...tool, action: mcpCallAction(first.server, first.tool, first.input) },
    ...others.map((call, index): ToolFeedItem => {
      const status = statusOf(call, ended)

      return {
        ...tool,
        id: `${tool.id}#${index + 1}`,
        input: call.input,
        action: mcpCallAction(call.server, call.tool, call.input),
        status,
        result: ended ? { text: '', isError: status === 'error', truncated: false } : null,
        endedAt: ended ? endedAt : 0,
        closedReason: status === 'interrupted' ? 'turnEnded' : null,
      }
    }),
  ]
}

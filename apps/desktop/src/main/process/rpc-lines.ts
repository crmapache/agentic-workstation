/**
 * Строки JSON-RPC построчно, по объекту на строку: `codex app-server` пишет без поля
 * `jsonrpc`, агенты ACP (ADR 0092) - с `"jsonrpc": "2.0"`. Разбор одинаковый и поля версии не
 * требует; писать его или нет, решает dialect. Чистые функции: процессы только раскладывают
 * строки по видам.
 */

/** Как писать строки: Codex - без поля версии, JSON-RPC 2.0 (ACP) - с ним. */
export type RpcDialect = 'bare' | 'jsonrpc2'

const head = (dialect: RpcDialect) => (dialect === 'jsonrpc2' ? { jsonrpc: '2.0' } : {})

export type RpcId = number | string

/** Ответ на наш запрос: результат или ошибка. */
export type RpcResponse = {
  kind: 'response'
  id: RpcId
  result: unknown
  /** data - подробности сервера (у ACP «Internal error» настоящая причина - там). */
  error: { code: number; message: string; data?: unknown } | null
}

/** Уведомление сервера: событие без ответа. */
export type RpcNotification = { kind: 'notification'; method: string; params: unknown }

/** Запрос сервера к клиенту: вопрос разрешения, вопрос с вариантами. Ждёт ответа. */
export type RpcServerRequest = { kind: 'request'; id: RpcId; method: string; params: unknown }

export type RpcLine = RpcResponse | RpcNotification | RpcServerRequest

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isId = (value: unknown): value is RpcId =>
  typeof value === 'number' || (typeof value === 'string' && value !== '')

const errorOf = (value: unknown): RpcResponse['error'] => {
  if (!isRecord(value)) return null

  return {
    code: typeof value['code'] === 'number' ? value['code'] : 0,
    message: typeof value['message'] === 'string' ? value['message'] : '',
    ...(value['data'] !== undefined && { data: value['data'] }),
  }
}

/** Строка потока - вид сообщения; не JSON и не JSON-RPC - null (сервер печатает и прочее). */
export const parseRpcLine = (line: string): RpcLine | null => {
  const trimmed = line.trim()

  if (!trimmed.startsWith('{')) return null

  let value: unknown

  try {
    value = JSON.parse(trimmed)
  } catch {
    return null
  }

  if (!isRecord(value)) return null

  const { id, method } = value

  if (typeof method === 'string' && method !== '') {
    return isId(id)
      ? { kind: 'request', id, method, params: value['params'] }
      : { kind: 'notification', method, params: value['params'] }
  }

  if (!isId(id)) return null

  return { kind: 'response', id, result: value['result'], error: errorOf(value['error']) }
}

/** Наш запрос строкой. */
export const requestLine = (
  id: number,
  method: string,
  params: unknown,
  dialect: RpcDialect = 'bare',
): string =>
  `${JSON.stringify({ ...head(dialect), id, method, ...(params !== undefined && { params }) })}\n`

/** Наше уведомление строкой. */
export const notificationLine = (
  method: string,
  params?: unknown,
  dialect: RpcDialect = 'bare',
): string =>
  `${JSON.stringify({ ...head(dialect), method, ...(params !== undefined && { params }) })}\n`

/** Ответ на запрос сервера строкой: результат или ошибка. */
export const responseLine = (
  id: RpcId,
  outcome: { result: unknown } | { error: { code: number; message: string } },
  dialect: RpcDialect = 'bare',
): string => `${JSON.stringify({ ...head(dialect), id, ...outcome })}\n`

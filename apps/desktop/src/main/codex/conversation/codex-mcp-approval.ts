import type { ToolFeedItem } from '@shared/conversation-feed'

/**
 * Одобрение вызова инструмента MCP у Codex (проверено на 0.163). Перед вызовом инструмента без
 * пометки «только чтение» Codex спрашивает клиента формой MCP (`mcpServer/elicitation/request`,
 * режим form, пустая схема) с пометкой `_meta.codex_approval_kind = "mcp_tool_call"`. Отказ и
 * ошибку в ответ он отдаёт модели как «user rejected MCP tool call», поэтому форму, которую
 * клиент не узнал, модель принимает за отказ человека. В режиме «без вопросов» (never) Codex
 * не спрашивает вовсе.
 */

/** О каком вызове спрашивают: сервер (имя у Codex), инструмент и аргументы. */
export type McpAsk = {
  server: string
  /** Из текста вопроса (`run tool "имя"`); пусто - Codex сказал его другими словами. */
  tool: string
  params: Record<string, unknown>
  /** Codex умеет помнить одобрение до конца сессии (`persist` предлагает `session`). */
  session: boolean
}

/** Вызов ленты, который может ждать одобрения. */
export type McpCandidate = {
  id: string
  server: string
  tool: string
  input: Record<string, unknown>
}

const APPROVAL_KIND = 'mcp_tool_call'
const FORM_MODES: ReadonlySet<string> = new Set(['form', 'openai/form', 'openaiForm'])
const TOOL_IN_MESSAGE = /run tool "([^"]+)"/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

/** Форма MCP от Codex - одобрение вызова инструмента? null - другая форма или ссылка. */
export const mcpAskOf = (body: Record<string, unknown>): McpAsk | null => {
  const meta = isRecord(body['_meta']) ? body['_meta'] : {}

  if (!FORM_MODES.has(text(body, 'mode')) || meta['codex_approval_kind'] !== APPROVAL_KIND) {
    return null
  }

  const persist = meta['persist']
  const offers: unknown[] = Array.isArray(persist) ? persist : [persist]

  return {
    server: text(body, 'serverName'),
    tool: TOOL_IN_MESSAGE.exec(text(body, 'message'))?.[1] ?? '',
    params: isRecord(meta['tool_params']) ? meta['tool_params'] : {},
    session: offers.includes('session'),
  }
}

/** Вызов MCP из ленты - кандидат; другой вызов - null. */
export const mcpCandidateOf = (tool: ToolFeedItem): McpCandidate | null =>
  tool.action.kind === 'mcp'
    ? { id: tool.id, server: tool.action.server, tool: tool.action.tool, input: tool.input }
    : null

/** JSON без зависимости от порядка ключей: аргументы вызова и вопроса сравниваются по смыслу. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    isRecord(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner,
  )

/**
 * Какой из идущих вызовов ждёт одобрения: id вызова Codex в вопрос не кладёт. Последний того же
 * сервера и инструмента, с теми же аргументами, если такой есть: параллельные вызовы одного
 * сервера (код-режим Codex) не путаются. null - такого вызова в ленте нет.
 */
export const pickMcpCall = (candidates: readonly McpCandidate[], ask: McpAsk): string | null => {
  const same = candidates.filter(
    (candidate) => candidate.server === ask.server && (!ask.tool || candidate.tool === ask.tool),
  )
  const params = canonical(ask.params)
  const exact = same.filter((candidate) => canonical(candidate.input) === params)

  return (exact.at(-1) ?? same.at(-1))?.id ?? null
}

/**
 * Ответ Codex на одобрение. «Разрешить и дальше» - до конца сессии и только если Codex это
 * предложил, как у остальных вопросов Codex. Вариант «навсегда» (`always`) он пишет в свой
 * `config.toml`, а серверов IDE там нет - их дают флаги процесса: запись не удалась бы, и
 * Codex с ошибкой в журнале всё равно помнил бы до конца сессии.
 */
export const mcpApprovalAnswer = (allowed: boolean, always: boolean, session: boolean) =>
  allowed
    ? { action: 'accept', content: {}, _meta: always && session ? { persist: 'session' } : null }
    : { action: 'decline', content: null, _meta: null }

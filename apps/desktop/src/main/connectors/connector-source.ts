import type { ToolAccess } from '@shared/connectors'
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js'

/** Инструмент источника - как его увидит модель, плюс ступень доступа. */
export type SourceTool = Tool & { access: ToolAccess }

/**
 * Откуда коннектор берёт инструменты: свой код поверх API сервиса (Gmail, Calendar) или
 * чужой MCP-сервер (Notion, Slack, свой адрес). Шлюзу всё равно, что внутри. signal -
 * провайдер ушёл, не дождавшись ответа; кто умеет, отменяет вызов у сервиса. После
 * dispose источник не оживает: новый собирает LiveConnector.
 */
export type ConnectorSource = {
  listTools: () => Promise<SourceTool[]>
  callTool: (
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<CallToolResult>
  dispose: () => Promise<void>
}

/** Входа нет, он истёк или отозван: нужен новый вход в браузере. */
export class SignedOutError extends Error {}

/** Ответ инструмента с текстом ошибки: модель прочитает и поймёт, что делать дальше. */
export const toolError = (text: string): CallToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
})

/** Ответ инструмента данными: JSON с отступами читается моделью лучше строки в строку. */
export const toolJson = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
})

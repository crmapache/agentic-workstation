import type { ToolAccess } from '@shared/connectors'
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js'

/**
 * Процесс разговора, который зовёт инструмент: ключ запуска шлюза, проект, папка, где процесс
 * работает (проект, у сессии сценария - её worktree), и разговор. Процессы одного разговора
 * сменяют друг друга (перезапуск ради коннекторов, другой аккаунт, сон), поэтому источник,
 * который держит что-то своё на разговор (сессия браузера), ключует это разговором, а не
 * процессом. Разговор не назван (вызов не из панели и не из сценария) - null.
 */
export type SourceLaunch = {
  id: string
  projectPath: string
  workDir: string
  conversationId: string | null
}

/** Инструмент источника - как его увидит модель, плюс ступень доступа. */
export type SourceTool = Tool & { access: ToolAccess }

/**
 * Откуда коннектор берёт инструменты: свой код поверх API сервиса (Gmail, Calendar) или
 * чужой MCP-сервер (Notion, Slack, свой адрес). Шлюзу всё равно, что внутри. signal -
 * провайдер ушёл, не дождавшись ответа; кто умеет, отменяет вызов у сервиса. launch - чей
 * процесс разговора зовёт (шлюз знает его по ключу); release - этот процесс кончился,
 * endConversation - кончился сам разговор (его вкладку закрыли). После
 * dispose источник не оживает: новый собирает LiveConnector.
 */
export type ConnectorSource = {
  listTools: () => Promise<SourceTool[]>
  callTool: (
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    launch?: SourceLaunch,
  ) => Promise<CallToolResult>
  release?: (launch: SourceLaunch) => void
  /** Разговор закрыт насовсем: то, что источник держал на него, отпускается сразу. */
  endConversation?: (conversationId: string) => void
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

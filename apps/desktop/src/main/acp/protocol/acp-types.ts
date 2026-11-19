/**
 * Сообщения ACP v1, которые читает и пишет IDE (ADR 0092): подмножество официальной схемы
 * (`@agentclientprotocol/sdk` 2.8.0, `schema/v1/schema.json`). Агенты добавляют своё в `_meta` и
 * в незаявленные поля - их читает драйвер агента, а не ядро. Всё, что приходит от агента,
 * разбирается осторожно: поля могут отсутствовать.
 */

/** Блок содержимого: текст, картинка, ссылка на ресурс, ресурс целиком. */
export type AcpContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string; uri?: string | undefined }
  | { type: 'resource_link'; uri: string; name: string; mimeType?: string | undefined }
  | {
      type: 'resource'
      resource: { uri: string; text?: string | undefined; mimeType?: string | undefined }
    }

/** Что умеет агент - ответ `initialize`. */
export type AcpAgentCapabilities = {
  loadSession?: boolean
  promptCapabilities?: { image?: boolean; embeddedContext?: boolean }
  sessionCapabilities?: {
    list?: object | null
    resume?: object | null
    close?: object | null
    delete?: object | null
    fork?: object | null
    additionalDirectories?: object | null
    systemPrompt?: object | null
  }
  mcpCapabilities?: { http?: boolean; sse?: boolean }
  auth?: { logout?: object | null }
  _meta?: Record<string, unknown> | null
}

export type AcpAuthMethod = {
  id: string
  name: string
  description?: string | null
  type?: string
  args?: string[]
  env?: Record<string, string>
}

export type AcpInitializeResult = {
  protocolVersion: number
  agentCapabilities?: AcpAgentCapabilities
  authMethods?: AcpAuthMethod[]
  agentInfo?: { name?: string; version?: string }
}

/** Сервер MCP для сессии: у IDE - только серверы шлюза коннекторов (ADR 0029) по HTTP. */
export type AcpMcpServer = {
  type: 'http'
  name: string
  url: string
  headers: { name: string; value: string }[]
}

/** Вариант настройки сессии (модель, уровень размышления, режим). */
export type AcpConfigOption = {
  id: string
  name: string
  category?: string | null
  type: string
  currentValue: string | boolean
  options?: { value: string; name: string; description?: string | null }[]
}

export type AcpMode = { id: string; name: string; description?: string | null }

/** Ответ `session/new`, `session/load`, `session/resume`, `session/fork`. */
export type AcpSessionSetup = {
  sessionId?: string
  configOptions?: AcpConfigOption[]
  modes?: { currentModeId: string; availableModes: AcpMode[] } | null
  models?: {
    currentModelId: string
    availableModels: { modelId: string; name: string; description?: string | null }[]
  } | null
  _meta?: Record<string, unknown> | null
}

export type AcpStopReason =
  'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled'

/** Расход хода - не по схеме v1: так отвечает `agy` (ADR 0092). */
export type AcpTurnUsage = {
  inputTokens?: number
  outputTokens?: number
  cachedReadTokens?: number
  cachedWriteTokens?: number
  thoughtTokens?: number
  totalTokens?: number
}

export type AcpPromptResult = { stopReason: AcpStopReason; usage?: AcpTurnUsage }

export type AcpSessionInfo = {
  sessionId: string
  cwd: string
  title?: string | null
  updatedAt?: string | null
}

export type AcpListResult = { sessions: AcpSessionInfo[]; nextCursor?: string | null }

/** Содержимое вызова: блок, дифф файла, терминал клиента (IDE терминалов не объявляет). */
export type AcpToolContent =
  | { type: 'content'; content: AcpContentBlock }
  | { type: 'diff'; path: string; oldText?: string | null; newText: string }
  | { type: 'terminal'; terminalId: string }

export type AcpToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'think'
  | 'fetch'
  | 'switch_mode'
  | 'other'

export type AcpToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

/** Вызов инструмента (`tool_call`) и его обновление (`tool_call_update`): поля - что пришло. */
export type AcpToolCall = {
  toolCallId: string
  title?: string | null
  kind?: AcpToolKind | null
  status?: AcpToolStatus | null
  content?: AcpToolContent[] | null
  locations?: { path: string; line?: number | null }[] | null
  rawInput?: unknown
  rawOutput?: unknown
  _meta?: Record<string, unknown> | null
} & Record<string, unknown>

export type AcpPlanEntry = {
  content: string
  priority?: 'high' | 'medium' | 'low'
  status: 'pending' | 'in_progress' | 'completed'
}

export type AcpAvailableCommand = { name: string; description?: string | null }

/** Обновление сессии (`session/update`). */
export type AcpSessionUpdate =
  | { sessionUpdate: 'user_message_chunk'; content: AcpContentBlock }
  | { sessionUpdate: 'agent_message_chunk'; content: AcpContentBlock }
  | { sessionUpdate: 'agent_thought_chunk'; content: AcpContentBlock }
  | ({ sessionUpdate: 'tool_call' } & AcpToolCall)
  | ({ sessionUpdate: 'tool_call_update' } & AcpToolCall)
  | { sessionUpdate: 'plan'; entries: AcpPlanEntry[] }
  | { sessionUpdate: 'available_commands_update'; availableCommands: AcpAvailableCommand[] }
  | { sessionUpdate: 'current_mode_update'; currentModeId: string }
  | { sessionUpdate: 'config_option_update'; configOptions: AcpConfigOption[] }
  | { sessionUpdate: 'session_info_update'; title?: string | null; updatedAt?: string | null }
  | { sessionUpdate: 'usage_update'; used: number; size: number }
  | {
      sessionUpdate: 'compaction_update'
      compactionId: string
      status: string
      error?: string | null
    }
  | { sessionUpdate: 'notice'; message?: string; severity?: string }

/** Вариант ответа на вопрос разрешения. */
export type AcpPermissionOption = {
  optionId: string
  name: string
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'
}

export type AcpPermissionRequest = {
  sessionId: string
  toolCall: AcpToolCall
  options: AcpPermissionOption[]
}

/** Поле формы вопроса: выбор (`oneOf`/`enum`), свой текст, да/нет, число. */
export type AcpFormProperty = {
  type?: string
  title?: string
  description?: string
  oneOf?: { const: string; title?: string; description?: string }[]
  enum?: string[]
  items?: { enum?: string[]; anyOf?: { const: string; title?: string }[] }
}

export type AcpElicitationRequest = {
  sessionId?: string
  toolCallId?: string
  mode: string
  message: string
  requestedSchema?: {
    properties?: Record<string, AcpFormProperty>
    required?: string[]
  }
}

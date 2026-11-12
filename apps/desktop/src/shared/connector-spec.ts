import type { McpAuth, ToolAccess, ImportCandidate } from './connectors'

/**
 * Как сервис пускает по ключу: Bearer в Authorization, свой заголовок, параметр адреса,
 * логин и пароль (Basic) или без входа. OAuth здесь нет: сервису с ним - свой MCP или
 * готовый тип коннектора.
 */
export type SpecAuth =
  | { type: 'bearer' }
  | { type: 'header'; name: string }
  | { type: 'query'; name: string }
  | { type: 'basic' }
  | { type: 'none' }

export type SpecMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Инструмент - один HTTP-запрос: путь с {аргументами}, какие аргументы в адрес и в тело. */
export type SpecTool = {
  name: string
  description: string
  access: ToolAccess
  method: SpecMethod
  /** От baseUrl: «/tasks/{task_id}». Аргумент в фигурных скобках подставляется экранированным. */
  path: string
  /** Аргументы, которые идут параметрами адреса. */
  query: string[]
  /** Аргументы, которые идут полями тела JSON. */
  body: string[]
  /** JSON Schema аргументов для модели: type object, properties, required. */
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[] | undefined
  }
}

/**
 * Коннектор, который описал ИИ по документации сервиса (ADR 0029): данные, а не код. Его
 * исполняет шлюз - только запросы на baseUrl, ключ подставляет сам. Модель, которая
 * описание писала, ключа не видит.
 */
export type HttpConnectorSpec = {
  service: string
  /** https, без строки запроса: только на этот адрес коннектор и ходит. */
  baseUrl: string
  auth: SpecAuth
  /** Где человеку взять ключ - словами для формы. */
  authHelp: string
  tools: SpecTool[]
}

/** Что попросить у ИИ: какой сервис, что с ним делать, где документация. */
export type GenerateConnectorRequest = {
  service: string
  goal: string
  docsUrl: string
}

/**
 * Где работа ИИ над коннектором (ADR 0050). working - идёт ход; ready - последний ответ
 * предлагает коннектор; asking - ответ без коннектора (вопрос, «не выйдет», пояснение), ИИ
 * ждёт человека; stopped - ход остановили (человек или выход из IDE); failed - ход сломался.
 * В любом из них человек может написать ИИ - разговор продолжится.
 */
export type AiJobStatus = 'working' | 'ready' | 'asking' | 'stopped' | 'failed'

/**
 * Почему ход сломался: нет Claude Code, ход не уложился в отведённое время, ответ не прошёл
 * проверку (описание, адрес, имя сервера), прочее (процесс упал, CLI сказал ошибку).
 */
export type AiJobError = 'cli-missing' | 'timeout' | 'invalid' | 'failed'

/** Что ИИ делает прямо сейчас: ищет в сети (слова), читает страницу (адрес), пишет ответ. */
export type AiJobActivity = { kind: 'search' | 'read' | 'answer'; subject: string }

/**
 * Что ИИ предлагает добавить: описание HTTP-запросов (ADR 0029), официальный MCP-сервер по
 * адресу или сервер, который у человека уже настроен в Claude Code, - его перенос берёт и
 * сохранённый вход, которого ИИ не видит.
 */
export type AiProposal =
  | {
      kind: 'http'
      spec: HttpConnectorSpec
      /** Инструменты, которые не прошли проверку и выброшены: их имена видит человек. */
      dropped: string[]
    }
  | { kind: 'mcp'; url: string; auth: McpAuth }
  | { kind: 'existing'; candidate: ImportCandidate }

/**
 * Работа ИИ над одним коннектором - разговор с ним (ADR 0050). Работ несколько, идут
 * параллельно и живут в главном процессе: окно их только показывает. Лента разговора
 * приходит отдельно (`connectors:aiJobFeed`), здесь - то, что видно на плитке.
 */
export type AiJob = {
  id: string
  request: GenerateConnectorRequest
  /** Когда начата (мс): новые - первыми. */
  createdAt: number
  status: AiJobStatus
  /** Шаг идущего хода; вне хода - null. */
  activity: AiJobActivity | null
  /** Последние слова ИИ человеку: что предлагает, о чём спрашивает, почему не выйдет. */
  message: string
  /** Последнее, что ИИ предложил: остаётся, пока он не предложит другое. */
  proposal: AiProposal | null
  /** У failed - почему; иначе null. */
  error: AiJobError | null
  /** Пояснение к ошибке: что не прошло проверку, последняя строка CLI. */
  detail: string
}

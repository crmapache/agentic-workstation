import type { ToolAccess } from './connectors'

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
 * Почему описание не вышло. unsupported - у сервиса нет входа по ключу (только OAuth),
 * cli-missing - нет Claude Code, cancelled - человек остановил, timeout - ИИ не уложился в
 * отведённое время, invalid - ИИ вернул то, что не прошло проверку, failed - прочее.
 */
export type GenerateConnectorError =
  'unsupported' | 'cli-missing' | 'cancelled' | 'timeout' | 'invalid' | 'failed'

/**
 * Работа ИИ над описанием (минуты). Её держит главный процесс: уход с вида Connectors или
 * перезагрузка окна её не прерывают, готовое описание ждёт человека.
 */
export type AiGeneration =
  | { status: 'idle' }
  | { status: 'running'; request: GenerateConnectorRequest }
  | {
      status: 'ready'
      request: GenerateConnectorRequest
      spec: HttpConnectorSpec
      /** Инструменты, которые не прошли проверку и выброшены: их имена видит человек. */
      dropped: string[]
    }
  | {
      status: 'failed'
      request: GenerateConnectorRequest
      error: GenerateConnectorError
      /** Пояснение: причина от ИИ (unsupported) или что не прошло проверку (invalid). */
      detail: string
    }

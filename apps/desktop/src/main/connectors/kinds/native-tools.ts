import type { ToolAccess } from '@shared/connectors'
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import { toolJson, toolError, SignedOutError } from '../connector-source'
import type { SourceTool, SourceLaunch, ConnectorSource } from '../connector-source'

/** Аргументы вызова не те: модель увидит текст и поправит вызов. */
export class ArgumentError extends Error {}

/**
 * Чей вызов: процесс разговора (вызов не через шлюз - null) и отмена провайдером. Нужен
 * инструментам, которые держат что-то на разговор, - сессии браузера.
 */
export type NativeCall = { launch: SourceLaunch | null; signal: AbortSignal | undefined }

/**
 * Ответ инструмента как есть, а не JSON: картинка (снимок экрана браузера) или длинный текст,
 * который в строке JSON модель читала бы с экранированными переводами строк.
 */
export class ToolOutput {
  constructor(readonly result: CallToolResult) {}
}

/**
 * Свой инструмент коннектора: описание для модели, ступень доступа и работа. Возвращает
 * данные - шлюз отдаст их модели JSON (или ToolOutput как есть). Ошибку, понятную модели,
 * бросает текстом.
 */
export type NativeTool<Api> = {
  name: string
  description: string
  access: ToolAccess
  inputSchema: Tool['inputSchema']
  run: (args: Record<string, unknown>, api: Api, call: NativeCall) => Promise<unknown>
}

/** Что источник делает, когда кончился процесс разговора, сам разговор и когда гаснет сам. */
export type NativeHooks = {
  release?: (launch: SourceLaunch) => void
  endConversation?: (conversationId: string) => void
  dispose?: () => Promise<void>
}

/** Ошибки, текст которых модели полезен: неверные аргументы и отказ сервиса. */
export type ExplainableError = new (...args: never[]) => Error

/**
 * Источник из своих инструментов: Gmail и Calendar. Ступени заданы в коде, а не
 * угаданы по имени. Входа нет - SignedOutError уходит выше: шлюз скажет модели про вход,
 * а сервис покажет его в настройках.
 */
export class NativeSource<Api> implements ConnectorSource {
  constructor(
    private readonly tools: readonly NativeTool<Api>[],
    private readonly api: Api,
    private readonly explainable: readonly ExplainableError[],
    private readonly hooks: NativeHooks = {},
  ) {}

  listTools(): Promise<SourceTool[]> {
    return Promise.resolve(
      this.tools.map(({ name, description, access, inputSchema }) => ({
        name,
        description,
        access,
        inputSchema,
        annotations: { readOnlyHint: access === 'read' },
      })),
    )
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    launch?: SourceLaunch,
  ): Promise<CallToolResult> {
    const tool = this.tools.find((candidate) => candidate.name === name)

    if (!tool) return toolError(`Unknown tool ${name}`)

    try {
      const value = await tool.run(args, this.api, { launch: launch ?? null, signal })

      return value instanceof ToolOutput ? value.result : toolJson(value)
    } catch (error) {
      if (error instanceof SignedOutError) throw error

      if (
        error instanceof ArgumentError ||
        this.explainable.some((type) => error instanceof type)
      ) {
        return toolError((error as Error).message)
      }

      throw error
    }
  }

  release(launch: SourceLaunch): void {
    this.hooks.release?.(launch)
  }

  endConversation(conversationId: string): void {
    this.hooks.endConversation?.(conversationId)
  }

  dispose(): Promise<void> {
    return this.hooks.dispose?.() ?? Promise.resolve()
  }
}

/** Строка из аргументов; required - без неё вызов не имеет смысла. */
export function stringArg(args: Record<string, unknown>, key: string, required: true): string
export function stringArg(
  args: Record<string, unknown>,
  key: string,
  required?: false,
): string | undefined
export function stringArg(
  args: Record<string, unknown>,
  key: string,
  required = false,
): string | undefined {
  const value = args[key]

  if (typeof value === 'string' && value.trim()) return value

  if (value === undefined || value === null || value === '') {
    if (required) throw new ArgumentError(`"${key}" is required`)

    return undefined
  }

  throw new ArgumentError(`"${key}" must be a string`)
}

/**
 * id для пути API: экранированный и не «.» или «..» - адрес нормализуется, и такой id
 * указал бы на соседний ресурс (сам календарь вместо события).
 */
export const pathId = (value: string, key: string): string => {
  if (value === '.' || value === '..') throw new ArgumentError(`"${key}" is not a valid id`)

  return encodeURIComponent(value)
}

/** Список строк; одна строка вместо списка - тоже список: модели так проще. */
export const stringListArg = (args: Record<string, unknown>, key: string): string[] => {
  const value = args[key]

  if (value === undefined || value === null) return []

  if (typeof value === 'string') return value.trim() ? [value] : []

  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value.filter((item) => item.trim())
  }

  throw new ArgumentError(`"${key}" must be a list of strings`)
}

/** Число в пределах; нет - значение по умолчанию. */
export const numberArg = (
  args: Record<string, unknown>,
  key: string,
  limits: { min: number; max: number; fallback: number },
): number => {
  const value = args[key]

  if (value === undefined || value === null) return limits.fallback

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ArgumentError(`"${key}" must be a number`)
  }

  return Math.min(limits.max, Math.max(limits.min, Math.round(value)))
}

export const booleanArg = (
  args: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean => {
  const value = args[key]

  if (value === undefined || value === null) return fallback

  if (typeof value !== 'boolean') throw new ArgumentError(`"${key}" must be true or false`)

  return value
}

/**
 * Выполнить для всех, но не больше limit разом: сервис отвечает 429 на десятки
 * параллельных запросов. Порядок результатов - как у входа.
 */
export const mapLimit = async <T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = []
  let next = 0

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next

      next += 1
      results[index] = await run(items[index] as T)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))

  return results
}

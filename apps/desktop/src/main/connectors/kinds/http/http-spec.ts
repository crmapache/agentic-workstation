import { z } from 'zod'

import type { HttpConnectorSpec } from '@shared/connector-spec'

/** Имя инструмента и аргумента: латиница snake_case - его видит модель в имени вызова. */
const IDENTIFIER = /^[a-z][a-z0-9_]{0,47}$/

/** Имя заголовка или параметра адреса для ключа: обычные знаки токена HTTP. */
const TOKEN_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/

/** Аргумент в пути: {task_id}. */
const PATH_ARGUMENT = /\{([^}]+)\}/g

/**
 * Путь инструмента: от корня, без строки запроса, якоря и обратной косой (её URL читает как
 * «/»), без сегментов «.» и «..» - ни буквально, ни через %2e: URL свернул бы их и вывел
 * запрос за baseUrl.
 */
const isSafePath = (path: string): boolean =>
  /^\/[^?#\\\s]*$/.test(path) &&
  !path.split('/').some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment))

const isHttpsBase = (value: string): boolean => {
  try {
    const url = new URL(value)

    return url.protocol === 'https:' && !url.search && !url.hash && !url.username && !url.password
  } catch {
    return false
  }
}

const authSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bearer') }),
  z.object({ type: z.literal('header'), name: z.string().regex(TOKEN_NAME) }),
  z.object({ type: z.literal('query'), name: z.string().regex(TOKEN_NAME) }),
  z.object({ type: z.literal('basic') }),
  z.object({ type: z.literal('none') }),
])

const toolSchema = z
  .object({
    name: z.string().regex(IDENTIFIER),
    description: z.string().min(1).max(1000),
    access: z.enum(['read', 'write', 'outbound']),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    path: z.string().max(300).refine(isSafePath, 'path must start with / and stay under baseUrl'),
    query: z.array(z.string().regex(IDENTIFIER)).max(30),
    body: z.array(z.string().regex(IDENTIFIER)).max(60),
    inputSchema: z.object({
      type: z.literal('object'),
      properties: z.record(z.string(), z.unknown()),
      required: z.array(z.string()).optional(),
    }),
  })
  // Аргумент пути, адреса и тела должен быть описан для модели - иначе она его не пришлёт.
  .refine((tool) => {
    const known = new Set(Object.keys(tool.inputSchema.properties))
    const inPath = [...tool.path.matchAll(PATH_ARGUMENT)].map((match) => match[1] ?? '')

    return [...inPath, ...tool.query, ...tool.body].every((name) => known.has(name))
  }, 'Every path, query and body argument must be in inputSchema.properties')

/** Описание коннектора от ИИ - проверяется здесь целиком, прежде чем шлюз его исполнит. */
export const specSchema = z.object({
  service: z.string().min(1).max(80),
  baseUrl: z.string().max(300).refine(isHttpsBase, 'baseUrl must be https without query'),
  auth: authSchema,
  authHelp: z.string().max(600),
  tools: z
    .array(toolSchema)
    .min(1)
    .max(40)
    .refine(
      (tools) => new Set(tools.map((tool) => tool.name)).size === tools.length,
      'Tool names must be unique',
    ),
})

/** Описание, прошедшее проверку; не прошло - null. */
export const parseSpec = (value: unknown): HttpConnectorSpec | null => {
  const parsed = specSchema.safeParse(value)

  return parsed.success ? parsed.data : null
}

/** Ответ ИИ: описание без негодных инструментов - или что именно не прошло проверку. */
export type AiSpecParse =
  { spec: HttpConnectorSpec; dropped: string[] } | { spec: null; detail: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toolName = (tool: unknown, index: number): string =>
  isRecord(tool) && typeof tool['name'] === 'string' ? tool['name'] : `#${index + 1}`

/**
 * Описание от ИИ. Проверки связей (аргумент пути описан, имя не повторяется) в JSON-схему
 * для CLI не попадают, и один кривой инструмент не должен стоить минут работы: он
 * выбрасывается и называется, остальное проверяется как обычно.
 */
export const parseAiSpec = (value: unknown): AiSpecParse => {
  const record = isRecord(value) ? value : {}
  const names = new Set<string>()
  const kept: unknown[] = []
  const dropped: string[] = []
  const reasons: string[] = []

  for (const [index, tool] of (Array.isArray(record['tools']) ? record['tools'] : []).entries()) {
    const parsed = toolSchema.safeParse(tool)

    if (parsed.success && !names.has(parsed.data.name)) {
      names.add(parsed.data.name)
      kept.push(tool)
    } else {
      dropped.push(toolName(tool, index))
      reasons.push(
        `${toolName(tool, index)}: ${parsed.success ? 'repeated name' : z.prettifyError(parsed.error)}`,
      )
    }
  }

  const parsed = specSchema.safeParse({ ...record, tools: kept })

  if (parsed.success) return { spec: parsed.data, dropped }

  return {
    spec: null,
    detail: [z.prettifyError(parsed.error), ...reasons].join('\n').slice(0, 2000),
  }
}

/** Аргументы пути инструмента по порядку. */
export const pathArguments = (path: string): string[] =>
  [...path.matchAll(PATH_ARGUMENT)].map((match) => match[1] ?? '')

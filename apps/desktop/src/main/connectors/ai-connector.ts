import { z } from 'zod'

import type { AiGeneration, GenerateConnectorRequest } from '@shared/connector-spec'

import { specSchema, parseAiSpec } from './kinds/http/http-spec'

/** Ответ ИИ: описание коннектора или честное «не выйдет» с причиной. */
const answerSchema = z.object({
  supported: z.boolean(),
  reason: z.string(),
  spec: specSchema.optional(),
})

/** Ответ разбирается мягче схемы: негодные инструменты выбрасывает parseAiSpec. */
const looseAnswer = z.object({
  supported: z.boolean(),
  reason: z.string(),
  spec: z.unknown().optional(),
})

/**
 * Схема ответа для CLI. draft-07, а не 2020-12 по умолчанию у zod: CLI проверяет схему
 * валидатором, который знает только draft-07, и 2020-12 отвергает целиком.
 */
const ANSWER_JSON_SCHEMA = z.toJSONSchema(answerSchema, { target: 'draft-7' })

/** Разовый вопрос к ИИ с ответом по схеме (structured-ask.ts у Claude Code). */
export type AskStructured = (
  prompt: string,
  schema: object,
  signal: AbortSignal,
) => Promise<
  { output: unknown } | { failure: 'cli-missing' | 'cancelled' | 'failed'; detail: string }
>

const prompt = (request: GenerateConnectorRequest): string =>
  [
    'You are designing a connector that lets an AI assistant use the web API of a service on behalf of one person.',
    `Service: ${request.service}`,
    `What the person wants the assistant to do: ${request.goal || 'the most useful everyday actions'}`,
    request.docsUrl
      ? `API documentation: ${request.docsUrl}`
      : 'Find the official API documentation yourself.',
    '',
    'Research the official REST API documentation with WebFetch and WebSearch, then return the connector description.',
    'Rules:',
    '- Only the official HTTPS REST API. baseUrl has no query string; tool paths start with "/" and are relative to baseUrl.',
    '- Auth must be a key the person can create themselves in their account: API key or personal access token as a Bearer header ("bearer"), a custom header ("header" with its name), a query parameter ("query" with its name), or login and password ("basic"). "none" only for fully public APIs.',
    '- If the service only allows OAuth apps and no personal key, set supported to false and explain why in reason.',
    '- Up to 20 tools that cover the goal; prefer reading tools. One tool is one HTTP request.',
    '- access: "read" for requests without side effects; "write" for creating or changing the person\'s own data; "outbound" for anything other people will see or receive: sending messages or emails, posting, commenting, inviting, sharing, replying.',
    '- Tool and argument names are snake_case. Describe every argument in inputSchema (JSON Schema, type object) with a clear description; put path arguments in the path as {name}; list in "query" the arguments that go to the query string and in "body" those that go to the JSON body.',
    '- Descriptions are short and say what the tool returns.',
    '- authHelp: one or two sentences on where exactly the person creates the key.',
  ].join('\n')

/** Сколько ждать ИИ: он читает документацию по сети, но не вечно. */
const ASK_TIMEOUT_MS = 10 * 60_000

const IDLE: AiGeneration = { status: 'idle' }

/** Что получилось из ответа CLI - готовое описание или причина отказа. */
const generationOf = (
  request: GenerateConnectorRequest,
  result: Awaited<ReturnType<AskStructured>>,
  timedOut: boolean,
): AiGeneration => {
  if ('failure' in result) {
    const error = timedOut && result.failure === 'cancelled' ? 'timeout' : result.failure

    return { status: 'failed', request, error, detail: result.detail }
  }

  const answer = looseAnswer.safeParse(result.output)

  if (!answer.success) {
    return { status: 'failed', request, error: 'invalid', detail: z.prettifyError(answer.error) }
  }

  if (!answer.data.supported) {
    return { status: 'failed', request, error: 'unsupported', detail: answer.data.reason }
  }

  const parsed = parseAiSpec(answer.data.spec)

  return parsed.spec
    ? { status: 'ready', request, spec: parsed.spec, dropped: parsed.dropped }
    : { status: 'failed', request, error: 'invalid', detail: parsed.detail }
}

/**
 * Коннектор от ИИ (ADR 0029): Claude Code читает документацию сервиса и возвращает
 * описание инструментов - данные, а не код. Описание проверяется той же схемой, что и при
 * добавлении; ключа ИИ не видит - его вводит человек уже после. Работа одна за раз и живёт
 * здесь, а не в окне: уход с вида Connectors и перезагрузка окна её не прерывают, итог
 * ждёт человека.
 */
export class AiConnectorDesk {
  private current: AiGeneration = IDLE
  private running: AbortController | null = null

  constructor(
    private readonly ask: AskStructured,
    private readonly changed: () => void,
  ) {}

  get state(): AiGeneration {
    return this.current
  }

  /** Начать работу; прежняя, если шла, отменяется. Итог придёт через changed. */
  generate(request: GenerateConnectorRequest): void {
    this.running?.abort()

    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, ASK_TIMEOUT_MS)

    this.running = controller
    this.set({ status: 'running', request })

    void this.ask(prompt(request), ANSWER_JSON_SCHEMA, controller.signal)
      .catch((error: unknown) => ({
        failure: 'failed' as const,
        detail: error instanceof Error ? error.message : '',
      }))
      .then((result) => {
        clearTimeout(timer)

        // Отменённая или заменённая работа своё итогом не пишет.
        if (this.running !== controller) return

        this.running = null
        this.set(generationOf(request, result, timedOut))
      })
  }

  /** Остановить работу: просьба остаётся в форме, итог - «остановлено». */
  cancel(): void {
    const { current, running } = this

    if (!running || current.status !== 'running') return

    this.running = null
    running.abort()
    this.set({ status: 'failed', request: current.request, error: 'cancelled', detail: '' })
  }

  /** Забыть итог: человек ушёл назад или уже добавил коннектор. */
  dismiss(): void {
    this.cancel()

    if (this.current.status !== 'idle') this.set(IDLE)
  }

  private set(next: AiGeneration): void {
    this.current = next
    this.changed()
  }
}

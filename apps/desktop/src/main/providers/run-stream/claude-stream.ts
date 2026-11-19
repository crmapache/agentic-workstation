import type { CliMessage, ControlRequest } from '../../claude/cli/cli-messages'

/**
 * Сообщения потока Claude Code, которые читает движок сценариев и заданий
 * (scenarios/engine/scenario-session.ts, stream-reading.ts, engine-sessions.ts,
 * engine-accounts.ts). Переводчик провайдера с другим потоком (Codex, OpenCode) собирает ими
 * свой ход - движок при этом не меняется (docs/plan-providers/50-ide.md).
 */

/** Токены хода словами Claude: чтение кеша - отдельно от входа, как считает статистика. */
export type StreamUsage = { input: number; output: number; cacheRead: number; cacheWrite: number }

export const NO_USAGE: StreamUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

export const addUsage = (left: StreamUsage, right: StreamUsage): StreamUsage => ({
  input: left.input + right.input,
  output: left.output + right.output,
  cacheRead: left.cacheRead + right.cacheRead,
  cacheWrite: left.cacheWrite + right.cacheWrite,
})

/** Ход начался: движок слышит процесс и, если ход начал не он, - что ход пошёл сам. */
export const streamInit = (sessionId: string): CliMessage => ({
  type: 'system',
  subtype: 'init',
  session_id: sessionId,
})

/** Начало текста ответа - живая строка «говорит» в окне. */
export const textStarted = (): CliMessage => ({
  type: 'stream_event',
  event: { type: 'content_block_start', content_block: { type: 'text' } },
})

export const textDelta = (text: string): CliMessage => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
})

/** Сообщение модели целиком: движок копит текст по id сообщения. */
export const assistantText = (id: string, text: string): CliMessage => ({
  type: 'assistant',
  message: { id, role: 'assistant', content: [{ type: 'text', text }] },
})

/** Концовка хода: последнее сообщение модели - её ответ (голова кладёт в него JSON). */
export const turnEnding = (): CliMessage => ({
  type: 'stream_event',
  event: { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
})

/** Модель упёрлась в лимит аккаунта: движок ищет другой аккаунт или ждёт. */
export const limitReached = (): CliMessage => ({
  type: 'assistant',
  error: 'rate_limit',
  message: { id: 'limit', content: [] },
})

/** Окно лимита и когда оно откроется (секунды эпохи) - для выручки на лимите. */
export const rateLimitEvent = (resetsAtSeconds: number, kind: string): CliMessage => ({
  type: 'rate_limit_event',
  rate_limit_info: { status: 'rejected', resetsAt: resetsAtSeconds, rateLimitType: kind },
})

/**
 * Конец хода. Ход, прерванный или упавший, - тоже итог с ошибкой: без него движок считал бы
 * ход открытым. costUsd - нарастающий итог процесса; у провайдера без цены - не передаётся.
 */
export const turnResult = (turn: {
  text: string
  isError: boolean
  turns: number
  usage: StreamUsage
  costUsd?: number | undefined
  /** Ответ по схеме хода (разговор о коннекторе); нет схемы - нет поля. */
  structured?: unknown
}): CliMessage => ({
  type: 'result',
  subtype: turn.isError ? 'error_during_execution' : 'success',
  result: turn.text,
  is_error: turn.isError,
  num_turns: turn.turns,
  usage: {
    input_tokens: turn.usage.input,
    output_tokens: turn.usage.output,
    cache_read_input_tokens: turn.usage.cacheRead,
    cache_creation_input_tokens: turn.usage.cacheWrite,
  },
  ...(turn.costUsd !== undefined && { total_cost_usd: turn.costUsd }),
  ...(turn.structured !== undefined &&
    turn.structured !== null && {
      structured_output: turn.structured,
    }),
})

/**
 * Фоновые помощники хода (субагенты, что работают после конца хода): пока они идут, движок
 * держит конец хода карточки - ответ ещё не готов, их отчёт поднимет следующий ход сам.
 */
export const backgroundTasks = (ids: readonly string[]): CliMessage => ({
  type: 'system',
  subtype: 'background_tasks_changed',
  tasks: ids.map((id) => ({ task_id: id, task_type: 'local_agent' })),
})

/** Вопрос разрешения или выбора - так его задаёт Claude Code (`can_use_tool`). */
export const toolQuestion = (
  requestId: string,
  toolName: string,
  input: Record<string, unknown>,
  description: string,
): ControlRequest => ({
  type: 'control_request',
  request_id: requestId,
  request: { subtype: 'can_use_tool', tool_name: toolName, input, description },
})

/** Вопрос снят провайдером (ответили в другом месте, ход кончился). */
export const questionWithdrawn = (requestId: string): ControlRequest => ({
  type: 'control_cancel_request',
  request_id: requestId,
})

/** Ответ движка на вопрос: разрешить (с ответами выбора во входе) или отказать. */
export type EngineAnswer =
  { allow: true; input: Record<string, unknown> } | { allow: false; message: string }

/** Ответ движка словами Claude (`{behavior, updatedInput | message}`) - общим видом. */
export const engineAnswerOf = (response: Record<string, unknown>): EngineAnswer => {
  const input = response['updatedInput']

  return response['behavior'] === 'allow'
    ? {
        allow: true,
        input:
          typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {},
      }
    : { allow: false, message: typeof response['message'] === 'string' ? response['message'] : '' }
}

/** Сообщение движка в разговор (`{type: 'user', message: {content}}`): текст и картинки. */
export type EnginePrompt = {
  text: string
  images: { mediaType: string; data: string }[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Сообщение движка; не сообщение человека (ответ на управляющий запрос) - null. */
export const enginePromptOf = (message: object): EnginePrompt | null => {
  const record = message as Record<string, unknown>
  const body = isRecord(record['message']) ? record['message'] : {}

  if (record['type'] !== 'user' || !Array.isArray(body['content'])) return null

  const blocks = body['content'].filter(isRecord)
  const text = blocks
    .filter((block) => block['type'] === 'text' && typeof block['text'] === 'string')
    .map((block) => block['text'] as string)
    .join('\n\n')
  const images = blocks.flatMap((block) => {
    const source = isRecord(block['source']) ? block['source'] : {}
    const mediaType = source['media_type']
    const data = source['data']

    return block['type'] === 'image' && typeof mediaType === 'string' && typeof data === 'string'
      ? [{ mediaType, data }]
      : []
  })

  return { text, images }
}

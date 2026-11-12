import { mkdir } from 'node:fs/promises'

import type { ClaudeCli } from './cli/cli-locator'
import { runCli } from './tools/cli-run'

/** Чем кончился разовый вопрос к Claude Code. */
export type AskResult =
  { output: unknown } | { failure: 'cli-missing' | 'cancelled' | 'failed'; detail: string }

export type AskRequest = {
  prompt: string
  /** JSON Schema ответа: CLI вернёт готовый объект (structured_output). */
  schema: object
  /**
   * Единственные инструменты вопроса (WebFetch, WebSearch): других у модели нет вовсе.
   * Пусто - без инструментов совсем (имя по описанию, ответ из головы).
   */
  tools: string[]
  /** Модель вопроса; нет - та, что CLI берёт по умолчанию. */
  model?: string
  /** Пустая своя папка: без хуков и CLAUDE.md чужого проекта. */
  cwd: string
  timeoutMs: number
  signal: AbortSignal
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Ограда служебного процесса ИИ: ответ по схеме и только разрешённые инструменты.
 * Инструменты - белым списком (`--tools`), а не запретом лишних: запрет пропустил бы любой
 * инструмент, которого нет в списке, а модель читает чужие страницы и может получить из них
 * что угодно. Сверху - без настроек, хуков, CLAUDE.md и MCP человека (`--safe-mode`,
 * `--restricted`, `--strict-mcp-config`): вопросу они не нужны, а личные заметки из
 * CLAUDE.md незачем держать рядом с чужими страницами. Всё не разрешённое - отказ без
 * вопроса (`dontAsk`): спросить тут некого. Общая у разового вопроса и у разговора о
 * коннекторе (connector-chat).
 */
export const fenceArgs = (request: Pick<AskRequest, 'schema' | 'tools' | 'model'>): string[] => [
  '--json-schema',
  JSON.stringify(request.schema),
  '--safe-mode',
  '--restricted',
  '--strict-mcp-config',
  '--permission-mode',
  'dontAsk',
  // Пустой список `--tools` CLI понимает как «никаких инструментов» только пустой строкой.
  ...(request.tools.length > 0
    ? ['--tools', ...request.tools, '--allowedTools', ...request.tools]
    : ['--tools', '']),
  ...(request.model ? ['--model', request.model] : []),
]

/** Аргументы разового вопроса: один JSON на выходе и ограда (fenceArgs). */
export const askArgs = (request: Pick<AskRequest, 'schema' | 'tools' | 'model'>): string[] => [
  '-p',
  '--output-format',
  'json',
  ...fenceArgs(request),
]

/**
 * Разовый вопрос к Claude Code без разговора и без MCP: `claude -p` с ответом по
 * JSON-схеме. Текст вопроса - на stdin (с переводами строк аргументом нельзя). Схема едет
 * аргументом: IDE только для macOS, а там аргументы запуска кавычек не боятся.
 */
export const askStructured = async (cli: ClaudeCli, request: AskRequest): Promise<AskResult> => {
  await mkdir(request.cwd, { recursive: true })

  const run = await runCli(cli, askArgs(request), request.cwd, request.timeoutMs, request.prompt, {
    signal: request.signal,
  })

  if (request.signal.aborted) return { failure: 'cancelled', detail: '' }

  const parsed = parseJson(run.stdout)

  if (
    !isRecord(parsed) ||
    parsed['is_error'] === true ||
    parsed['structured_output'] === undefined
  ) {
    const detail =
      isRecord(parsed) && typeof parsed['result'] === 'string' ? parsed['result'] : run.stderr

    return { failure: 'failed', detail: detail.slice(0, 2000) }
  }

  return { output: parsed['structured_output'] }
}

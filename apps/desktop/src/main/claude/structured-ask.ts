import { mkdir } from 'node:fs/promises'

import type { ClaudeCli } from './cli/cli-locator'
import { runCli } from './tools/cli-run'

/** Чем кончился разовый вопрос к Claude Code; costUsd - по ценам API, 0 - CLI не сказал. */
export type AskResult =
  | { output: unknown; costUsd: number }
  | { failure: 'cli-missing' | 'cancelled' | 'failed'; detail: string; costUsd: number }

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
  /** Усилие (`--effort`); нет - как у CLI. Проверкам поручений хватает low. */
  effort?: string
  /**
   * Конфиг шлюза коннекторов (`--mcp-config`) и инструменты из него, разрешённые поимённо
   * (mcp__сервер__инструмент): всё прочее из конфига - отказ без вопроса. Нет - без MCP.
   */
  mcpConfig?: string
  mcpTools?: readonly string[]
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
 * `--safe-mode` гасит и серверы из `--mcp-config` (проверено на Claude Code 2.1.293: init с
 * пустым mcp_servers). Вопросу с коннекторами та же изоляция другим набором: без слоёв настроек
 * человека (с ними уходят его хуки и плагины) и без навыков; CLAUDE.md и авто-память - окружением
 * (`isolationEnv`).
 */
const MCP_ISOLATION_ARGS = ['--setting-sources', '', '--disable-slash-commands']

/** Окружение вопроса: с коннекторами - без CLAUDE.md и памяти человека (их не гасит флаг). */
export const isolationEnv = (
  env: Record<string, string>,
  withMcp: boolean,
): Record<string, string> =>
  withMcp
    ? { ...env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' }
    : env

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
export const fenceArgs = (
  request: Pick<AskRequest, 'schema' | 'tools' | 'model' | 'effort' | 'mcpConfig' | 'mcpTools'>,
): string[] => {
  const mcpTools = request.mcpConfig ? (request.mcpTools ?? []) : []
  const allowed = [...request.tools, ...mcpTools]

  return [
    '--json-schema',
    JSON.stringify(request.schema),
    ...(request.mcpConfig ? MCP_ISOLATION_ARGS : ['--safe-mode']),
    '--restricted',
    '--strict-mcp-config',
    ...(request.mcpConfig ? ['--mcp-config', request.mcpConfig] : []),
    '--permission-mode',
    'dontAsk',
    // Пустой список `--tools` CLI понимает как «никаких инструментов» только пустой строкой.
    ...(request.tools.length > 0 ? ['--tools', ...request.tools] : ['--tools', '']),
    ...(allowed.length > 0 ? ['--allowedTools', ...allowed] : []),
    ...(request.model ? ['--model', request.model] : []),
    ...(request.effort ? ['--effort', request.effort] : []),
  ]
}

/** Аргументы разового вопроса: один JSON на выходе и ограда (fenceArgs). */
export const askArgs = (
  request: Pick<AskRequest, 'schema' | 'tools' | 'model' | 'effort' | 'mcpConfig' | 'mcpTools'>,
): string[] => ['-p', '--output-format', 'json', ...fenceArgs(request)]

/**
 * Разовый вопрос к Claude Code без разговора и без MCP: `claude -p` с ответом по
 * JSON-схеме. Текст вопроса - на stdin (с переводами строк аргументом нельзя). Схема едет
 * аргументом: IDE только для macOS, а там аргументы запуска кавычек не боятся.
 */
export const askStructured = async (cli: ClaudeCli, request: AskRequest): Promise<AskResult> => {
  await mkdir(request.cwd, { recursive: true })

  const fenced = { ...cli, env: isolationEnv(cli.env, Boolean(request.mcpConfig)) }
  const run = await runCli(
    fenced,
    askArgs(request),
    request.cwd,
    request.timeoutMs,
    request.prompt,
    {
      signal: request.signal,
    },
  )

  if (request.signal.aborted) return { failure: 'cancelled', detail: '', costUsd: 0 }

  const parsed = parseJson(run.stdout)
  const cost = isRecord(parsed) ? parsed['total_cost_usd'] : null
  const costUsd = typeof cost === 'number' && Number.isFinite(cost) ? cost : 0

  if (
    !isRecord(parsed) ||
    parsed['is_error'] === true ||
    parsed['structured_output'] === undefined
  ) {
    const detail =
      isRecord(parsed) && typeof parsed['result'] === 'string' ? parsed['result'] : run.stderr

    return { failure: 'failed', detail: detail.slice(0, 2000), costUsd }
  }

  return { output: parsed['structured_output'], costUsd }
}

/**
 * Синтетические строки транскрипта Claude Code 2.1.x для тестов разбора: только поля,
 * которые читает статистика, в том же порядке ключей, что пишет CLI.
 */

const T0 = Date.parse('2026-11-10T10:00:00.000Z')

/** Время через столько минут от начала дня теста. */
export const at = (minutes: number): string => new Date(T0 + minutes * 60_000).toISOString()

export const atMs = (minutes: number): number => T0 + minutes * 60_000

type Common = { minute: number; uuid: string; session?: string; cwd?: string; sidechain?: boolean }

const common = ({
  minute,
  uuid,
  session = 'S1',
  cwd = '/work/app',
  sidechain = false,
}: Common) => ({
  parentUuid: null,
  isSidechain: sidechain,
  uuid,
  timestamp: at(minute),
  cwd,
  sessionId: session,
})

const line = (value: unknown): Buffer => Buffer.from(JSON.stringify(value))

export const humanPrompt = (base: Common, text: string, extra: Record<string, unknown> = {}) =>
  line({
    ...common(base),
    type: 'user',
    message: { role: 'user', content: text },
    promptSource: 'sdk',
    ...extra,
  })

export type Usage = { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }

export const assistant = (
  base: Common,
  answer: { id: string; request: string; model?: string; usage?: Usage },
  content: unknown[] = [{ type: 'text', text: 'ok' }],
) =>
  line({
    ...common(base),
    type: 'assistant',
    message: {
      id: answer.id,
      model: answer.model ?? 'claude-opus-5-5',
      role: 'assistant',
      content,
      usage: {
        input_tokens: answer.usage?.input ?? 0,
        output_tokens: answer.usage?.output ?? 0,
        cache_read_input_tokens: answer.usage?.cacheRead ?? 0,
        cache_creation_input_tokens: answer.usage?.cacheWrite ?? 0,
        cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
        speed: 'standard',
      },
    },
    requestId: answer.request,
  })

export const toolUse = (id: string, name: string, input: Record<string, unknown> = {}) => ({
  type: 'tool_use',
  id,
  name,
  input,
})

export const toolResult = (
  base: Common,
  toolUseId: string,
  toolUseResult: unknown,
  extra: { isError?: boolean; permission?: Record<string, unknown> } = {},
) =>
  line({
    ...common(base),
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          tool_use_id: toolUseId,
          type: 'tool_result',
          content: 'output with "quotes" and {braces}',
          ...(extra.isError ? { is_error: true } : {}),
        },
      ],
    },
    toolUseResult,
    ...(extra.permission ? { permissionDecision: extra.permission } : {}),
  })

export const attachment = (base: Common) =>
  line({ ...common(base), type: 'attachment', attachment: { type: 'date', timestamp: 'x' } })

/** Кусок structuredPatch: строки с «+», «-» и пробелом. */
export const hunk = (lines: string[]) => ({
  oldStart: 1,
  oldLines: lines.length,
  newStart: 1,
  newLines: lines.length,
  lines,
})

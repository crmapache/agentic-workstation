/**
 * Синтетические строки журнала Codex для тестов разбора: только поля, которые читает
 * статистика, в той же форме, что пишет Codex 0.163+ (новый журнал) и Codex 2025 года
 * (старый: без item_completed и token_usage_record).
 */

const T0 = Date.parse('2026-11-18T10:00:00.000Z')

export const atMs = (minutes: number): number => T0 + minutes * 60_000

const line = (minute: number, type: string, payload: Record<string, unknown>): Buffer =>
  Buffer.from(JSON.stringify({ timestamp: new Date(atMs(minute)).toISOString(), type, payload }))

export const THREAD = '01a1f015-5403-7990-a38a-00d36e0a56a4'

export const sessionMeta = (minute: number, patch: Record<string, unknown> = {}): Buffer =>
  line(minute, 'session_meta', {
    id: THREAD,
    session_id: THREAD,
    cwd: '/work/app',
    originator: 'agentic_workstation',
    cli_version: '0.163.0',
    source: 'vscode',
    model_provider: 'openai',
    ...patch,
  })

export const turnContext = (minute: number, model = 'gpt-6-sol', cwd = '/work/app'): Buffer =>
  line(minute, 'turn_context', { turn_id: `turn-${minute}`, cwd, model })

export const settings = (minute: number, tier: string): Buffer =>
  line(minute, 'event_msg', {
    type: 'thread_settings_applied',
    thread_id: THREAD,
    thread_settings: { model: 'gpt-6-sol', service_tier: tier, cwd: '/work/app' },
  })

export const taskStarted = (minute: number, turn: string): Buffer =>
  line(minute, 'event_msg', { type: 'task_started', turn_id: turn, started_at: atMs(minute) })

export const taskComplete = (minute: number, turn: string): Buffer =>
  line(minute, 'event_msg', { type: 'task_complete', turn_id: turn })

const usage = (input: number, cached: number, output: number) => ({
  input_tokens: input,
  cached_input_tokens: cached,
  cache_write_input_tokens: 0,
  output_tokens: output,
  reasoning_output_tokens: Math.floor(output / 2),
  total_tokens: input + output,
})

export const usageRecord = (
  minute: number,
  response: string,
  input: number,
  cached: number,
  output: number,
): Buffer =>
  line(minute, 'token_usage_record', {
    thread_id: THREAD,
    turn_id: 'turn-1',
    session_id: THREAD,
    response_id: response,
    usage: usage(input, cached, output),
  })

export const tokenCount = (
  minute: number,
  total: number,
  last: { input: number; cached: number; output: number },
): Buffer =>
  line(minute, 'event_msg', {
    type: 'token_count',
    info: {
      total_token_usage: { ...usage(total, 0, 0), total_tokens: total },
      last_token_usage: usage(last.input, last.cached, last.output),
    },
  })

export const item = (minute: number, body: Record<string, unknown>): Buffer =>
  line(minute, 'event_msg', {
    type: 'item_completed',
    thread_id: THREAD,
    turn_id: 'turn-1',
    item: body,
  })

export const userItem = (minute: number, id: string, text: string): Buffer =>
  item(minute, { type: 'UserMessage', id, content: [{ type: 'text', text, text_elements: [] }] })

export const functionCall = (minute: number, callId: string, name: string, args: unknown) =>
  line(minute, 'response_item', {
    type: 'function_call',
    name,
    arguments: JSON.stringify(args),
    call_id: callId,
  })

export const customCall = (minute: number, callId: string, name: string, input: string) =>
  line(minute, 'response_item', { type: 'custom_tool_call', name, input, call_id: callId })

export const callOutput = (minute: number, callId: string, output: string) =>
  line(minute, 'response_item', { type: 'custom_tool_call_output', call_id: callId, output })

export const userMessage = (minute: number, message: string): Buffer =>
  line(minute, 'event_msg', { type: 'user_message', message, images: [] })

/** Файлы журнала: строки через перевод строки, как их пишет Codex. */
export const rollout = (...rows: Buffer[]): string =>
  rows.map((row) => `${row.toString()}\n`).join('')

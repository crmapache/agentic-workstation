import { rm, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { journalPath } from '../run-stream/run-journal'
import type { CliMessage } from '../../claude/cli/cli-messages'
import type { CardAsk } from '../../scenarios/engine/run-mail'
import type { SessionSpec } from '../../scenarios/engine/scenario-session'
import { ScenarioSession } from '../../scenarios/engine/scenario-session'
import { AcpRunProcess } from './acp-run-process'
import { journalFeed } from './acp-step-feed'
import {
  callsOf,
  replyTo,
  fakeCalls,
  fakeRunHost,
  installFakeAgent,
} from './__fixtures__/fake-acp-agent'

const SESSION = '0f6e3a52-1b7c-4c1e-9a55-1c2d3e4f5a6b'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'acp-run-'))
  await installFakeAgent(dir)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** Сессия движка на переводчике ACP поверх поддельного Kimi - и всё, что движок услышал. */
const session = (spec: Partial<SessionSpec> = {}) => {
  const heard: CliMessage[] = []
  const asks: CardAsk[] = []
  const ended: CliMessage[] = []
  const withdrawn: string[] = []
  const errors: string[] = []
  const seen = { signedOut: 0, released: 0 }
  const engine = new ScenarioSession(
    (full, wires) =>
      new AcpRunProcess(fakeRunHost(dir, seen), full, { cwd: dir, projectPath: dir }, wires),
    {
      sessionId: SESSION,
      resume: false,
      model: '',
      effort: 'high',
      permissionMode: 'default',
      briefing: '',
      accountId: '',
      ...spec,
    },
    {
      onMessage: (message) => heard.push(message),
      onTurnStarted: () => undefined,
      onTurnEnded: (result) => ended.push(result),
      onAsk: (ask) => asks.push(ask),
      onWithdrawn: (requestId) => withdrawn.push(requestId),
      onError: (message) => errors.push(message),
      onCrashed: () => errors.push('crashed'),
    },
  )

  return { engine, heard, asks, ended, withdrawn, errors, seen }
}

/** Тексты сообщений модели, которые услышал движок (`assistant`). */
const said = (heard: readonly CliMessage[]): string[] =>
  heard.flatMap((message) => {
    const body = message['message'] as { content?: { text?: string }[] } | undefined

    return message.type === 'assistant' ? [body?.content?.[0]?.text ?? ''] : []
  })

/** Блоки сообщений, которые агент получил ходами. */
const prompts = async () =>
  callsOf(await fakeCalls(dir), 'session/prompt').map(
    (call) => call.params?.['prompt'] as { type: string; text?: string }[],
  )

/** Настройки сессии, которые IDE ставила: `<id>=<значение>`. */
const settings = async () =>
  callsOf(await fakeCalls(dir), 'session/set_config_option').map(
    (call) => `${String(call.params?.['configId'])}=${String(call.params?.['value'])}`,
  )

describe('прогон на агенте ACP через переводчик', () => {
  it('ход: новая сессия с коннекторами, бриф первым блоком, модель и усилие, итог без цены', async () => {
    const run = session({ briefing: 'You are the head.', model: 'k3-turbo', effort: 'minimal' })

    run.engine.sendPrompt('look')
    await expect.poll(() => run.ended.length).toBe(1)

    expect(run.errors).toEqual([])
    expect(run.ended[0]).toMatchObject({
      type: 'result',
      subtype: 'success',
      result: 'Done.',
      is_error: false,
      num_turns: 1,
      usage: { input_tokens: 0, output_tokens: 0 },
    })
    expect(run.ended[0]).not.toHaveProperty('total_cost_usd')
    expect(run.heard).toContainEqual({ type: 'system', subtype: 'init', session_id: SESSION })
    expect(said(run.heard)).toEqual(['Done.'])
    expect(run.heard).toContainEqual({
      type: 'stream_event',
      event: { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    })

    const calls = await fakeCalls(dir)

    expect(callsOf(calls, 'session/new')[0]?.params).toEqual({
      cwd: dir,
      mcpServers: [
        {
          type: 'http',
          name: 'gmail',
          url: 'http://127.0.0.1:1/mcp',
          headers: [{ name: 'Authorization', value: 'Bearer key' }],
        },
      ],
    })
    // Модель - из вариантов агента, minimal - «размышление выключено», режим по умолчанию уже стоит.
    expect(await settings()).toEqual(['model=k3-turbo', 'thinking=off'])
    expect(await prompts()).toEqual([
      [
        { type: 'text', text: 'You are the head.' },
        { type: 'text', text: 'look' },
      ],
    ])

    const journal = await readFile(journalPath(join(dir, 'journals'), SESSION), 'utf8')

    expect(JSON.parse(journal.split('\n')[0] ?? '')).toEqual({ native: 'session_1', cwd: dir })
    run.engine.stop()
  })

  it('вопрос на команду - Bash для головы; отказ - reject у агента; ответ хода - последнее сообщение', async () => {
    const run = session()

    run.engine.sendPrompt('run a command')
    await expect.poll(() => run.asks.length).toBe(1)
    expect(run.asks[0]).toMatchObject({ toolName: 'Bash', input: { command: 'ls -1' } })

    run.engine.answer(run.asks[0]?.requestId ?? '', false, 'no', {})
    await expect.poll(() => run.ended.length).toBe(1)

    expect(replyTo(await fakeCalls(dir), 101)?.result).toEqual({
      outcome: { outcome: 'selected', optionId: 'reject' },
    })
    // Сообщение до вызова и после - два ответа модели; ответ хода - последний.
    expect(said(run.heard)).toEqual(['Let me look.', 'Refused.'])
    expect(run.ended[0]).toMatchObject({ result: 'Refused.', is_error: false })
    await expect
      .poll(() => readFile(journalPath(join(dir, 'journals'), SESSION), 'utf8'))
      .toContain('"who":"tool","text":"Bash ls -1"')
    run.engine.stop()
  })

  it('план: ExitPlanMode с текстом плана; отказ - доработать, одобрение - plan_approve, режим плана - снова', async () => {
    const run = session({ permissionMode: 'plan' })

    run.engine.sendPrompt('make a plan')
    await expect.poll(() => run.asks.length).toBe(1)
    expect(run.asks[0]).toMatchObject({ toolName: 'ExitPlanMode' })
    expect(String(run.asks[0]?.input['plan'])).toContain('1. Step 1')

    // Отказ, как у Claude Code, оставляет в плане: «отказ и выход» дал бы править без плана.
    run.engine.answer(run.asks[0]?.requestId ?? '', false, 'not yet', {})
    await expect.poll(() => run.ended.length).toBe(1)
    expect(replyTo(await fakeCalls(dir), 101)?.result).toEqual({
      outcome: { outcome: 'selected', optionId: 'plan_revise' },
    })

    run.engine.sendPrompt('make a better plan')
    await expect.poll(() => run.asks.length).toBe(2)
    run.engine.answer(run.asks[1]?.requestId ?? '', true, '', {})
    await expect.poll(() => run.ended.length).toBe(2)
    expect(replyTo(await fakeCalls(dir), 102)?.result).toEqual({
      outcome: { outcome: 'selected', optionId: 'plan_approve' },
    })

    // Из одобренного плана агент вышел молча: следующий ход снова ставит план.
    run.engine.sendPrompt('look again')
    await expect.poll(() => run.ended.length).toBe(3)
    expect((await settings()).filter((one) => one === 'mode=plan')).toHaveLength(2)
    run.engine.stop()
  })

  it('только чтение: план агента, правка - отказ без движка, выход из плана - доработать', async () => {
    const run = session({ permissionMode: 'readOnly' })

    run.engine.sendPrompt('edit the file')
    await expect.poll(() => run.ended.length).toBe(1)

    const calls = await fakeCalls(dir)

    expect(run.asks).toEqual([])
    expect(await settings()).toContain('mode=plan')
    expect(replyTo(calls, 101)?.result).toEqual({
      outcome: { outcome: 'selected', optionId: 'reject' },
    })
    expect(replyTo(calls, 102)?.result).toEqual({
      outcome: { outcome: 'selected', optionId: 'plan_revise' },
    })
    expect(run.ended[0]).toMatchObject({ result: 'Stayed.' })
    run.engine.stop()
  })

  it('вопрос с вариантами - AskUserQuestion; ответ - значение варианта формы', async () => {
    const run = session()

    run.engine.sendPrompt('ask me a question')
    await expect.poll(() => run.asks.length).toBe(1)
    expect(run.asks[0]).toMatchObject({
      toolName: 'AskUserQuestion',
      input: {
        questions: [
          expect.objectContaining({
            question: 'Which color do you prefer?',
            options: [
              { label: 'Red', description: '' },
              { label: 'Blue', description: '' },
            ],
          }),
        ],
      },
    })

    run.engine.answer(run.asks[0]?.requestId ?? '', true, '', {
      answers: { 'Which color do you prefer?': 'Red' },
    })
    await expect.poll(() => run.ended.length).toBe(1)
    expect(replyTo(await fakeCalls(dir), 101)?.result).toEqual({
      action: 'accept',
      content: { q0: 'red' },
    })
    run.engine.stop()
  })

  it('Stop: session/cancel, вопрос снят у агента и у движка, итог с ошибкой', async () => {
    const run = session()

    run.engine.sendPrompt('a long command')
    await expect.poll(() => run.asks.length).toBe(1)

    run.engine.interrupt()
    await expect.poll(() => run.ended.length).toBe(1)

    const calls = await fakeCalls(dir)

    expect(run.withdrawn).toEqual([run.asks[0]?.requestId])
    expect(callsOf(calls, 'session/cancel')).toHaveLength(1)
    expect(replyTo(calls, 101)?.result).toEqual({ outcome: { outcome: 'cancelled' } })
    expect(run.ended[0]).toMatchObject({ is_error: true, result: '' })
    run.engine.stop()
  })

  it('схема ответа: словами в сообщении, итог несёт JSON, движку - слова поля message', async () => {
    const run = session({
      outputSchema: { type: 'object', properties: { message: { type: 'string' } } },
    })

    run.engine.sendPrompt('json please')
    await expect.poll(() => run.ended.length).toBe(1)

    expect(run.ended[0]).toMatchObject({ structured_output: { message: 'Hi', ok: true } })
    expect(said(run.heard)).toEqual(['Hi'])
    expect((await prompts())[0]?.[0]?.text).toContain('Reply with a single JSON object')
    run.engine.stop()
  })

  it('без входа - отказ понятным текстом, панель узнаёт, ключ шлюза отпущен', async () => {
    await writeFile(join(dir, 'signed-out'), '')

    const run = session()

    run.engine.sendPrompt('look')
    await expect.poll(() => run.errors.length).toBe(1)

    expect(run.errors[0]).toBe(
      'Kimi Code is not signed in. Sign in on the Kimi Code panel and run again.',
    )
    expect(run.seen.signedOut).toBe(1)
    expect(run.seen.released).toBeGreaterThan(0)
    run.engine.stop()
  })

  it('продолжение: новый процесс - session/resume разговора из журнала, бриф второй раз не едет', async () => {
    const first = session({ briefing: 'You are the head.' })

    first.engine.sendPrompt('look')
    await expect.poll(() => first.ended.length).toBe(1)
    first.engine.stop()

    const second = session({ briefing: 'You are the head.', resume: true })

    second.engine.sendPrompt('more')
    await expect.poll(() => second.ended.length).toBe(1)

    const calls = await fakeCalls(dir)

    expect(callsOf(calls, 'session/new')).toHaveLength(1)
    expect(callsOf(calls, 'session/resume')[0]?.params).toMatchObject({ sessionId: 'session_1' })
    expect((await prompts())[1]).toEqual([{ type: 'text', text: 'more' }])
    second.engine.stop()

    // Журнал шага без агента - из журнала прогона: оба сообщения и оба ответа.
    const items = await journalFeed(journalPath(join(dir, 'journals'), SESSION))

    expect(items.flatMap((item) => (item.kind === 'user' ? [item.text] : []))).toEqual([
      'look',
      'more',
    ])
    expect(items.filter((item) => item.kind === 'assistant')).toHaveLength(2)
  })
})

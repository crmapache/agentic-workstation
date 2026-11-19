import { rm, chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { CliMessage } from '../../claude/cli/cli-messages'
import type { CardAsk } from '../../scenarios/engine/run-mail'
import { ScenarioSession } from '../../scenarios/engine/scenario-session'
import type { CodexRunHost } from './codex-run-process'
import { CodexRunProcess } from './codex-run-process'

/**
 * Поддельный `codex app-server`: поток t1 (продолжение - тот же поток), запросы - в calls.json.
 * Ход отвечает «Do» кусками и «Done.» целиком; со словом «approve» сначала спрашивает
 * разрешение на команду `ls` и ждёт ответа; «limit» - ход падает на лимите аккаунта.
 */
const FAKE_SERVER = `#!/usr/bin/env node
const fs = require('node:fs')
const readline = require('node:readline')
const calls = []
const out = (value) => process.stdout.write(JSON.stringify(value) + '\\n')
const turn = (status, error) => ({ id: 'turn-1', status, items: [], ...(error ? { error } : {}) })
const finish = () => {
  out({ method: 'item/completed', params: { threadId: 't1', turnId: 'turn-1', item: { type: 'commandExecution', id: 'c1', command: 'ls', status: 'completed', exitCode: 0 } } })
  out({ method: 'item/completed', params: { threadId: 't1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'm1', text: 'Done.' } } })
  out({ method: 'thread/tokenUsage/updated', params: { threadId: 't1', turnId: 'turn-1', tokenUsage: { last: { inputTokens: 1000, cachedInputTokens: 600, outputTokens: 50, reasoningOutputTokens: 0, totalTokens: 1050 } } } })
  out({ method: 'turn/completed', params: { threadId: 't1', turn: turn('completed') } })
}
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  calls.push(message)
  fs.writeFileSync(__dirname + '/calls.json', JSON.stringify(calls))
  if (message.method === 'initialize') return out({ id: message.id, result: {} })
  if (message.method === 'thread/start' || message.method === 'thread/resume') return out({ id: message.id, result: { thread: { id: 't1' } } })
  if (message.method === 'turn/start') {
    out({ id: message.id, result: { turn: turn('inProgress') } })
    out({ method: 'turn/started', params: { threadId: 't1', turn: turn('inProgress') } })
    out({ method: 'item/started', params: { threadId: 't1', turnId: 'turn-1', item: { type: 'commandExecution', id: 'c1', command: 'ls', status: 'inProgress' } } })
    out({ method: 'item/agentMessage/delta', params: { threadId: 't1', turnId: 'turn-1', itemId: 'm1', delta: 'Do' } })
    const said = message.params.input[0].text
    if (said.includes('limit')) {
      out({ method: 'account/rateLimits/updated', params: { rateLimits: { limitId: 'codex', primary: { usedPercent: 100, resetsAt: 2000000000 } } } })
      return out({ method: 'turn/completed', params: { threadId: 't1', turn: turn('failed', { message: 'You hit your usage limit', codexErrorInfo: 'usageLimitExceeded' }) } })
    }
    if (said.includes('approve')) {
      return out({ id: 'ask-1', method: 'item/commandExecution/requestApproval', params: { threadId: 't1', turnId: 'turn-1', itemId: 'c1', command: "/bin/zsh -lc 'ls -la'" } })
    }
    return finish()
  }
  if (message.id === 'ask-1') return finish()
  if (message.method && message.id !== undefined) return out({ id: message.id, result: {} })
}).on('close', () => process.exit(0))
`

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'codex-run-'))
  await writeFile(join(dir, 'codex'), FAKE_SERVER)
  await chmod(join(dir, 'codex'), 0o755)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

type Call = { method?: string; id?: unknown; params?: Record<string, unknown>; result?: unknown }

const calls = async (): Promise<Call[]> =>
  JSON.parse(await readFile(join(dir, 'calls.json'), 'utf8').catch(() => '[]')) as Call[]

const host = (): CodexRunHost => ({
  cli: () =>
    Promise.resolve({
      binary: join(dir, 'codex'),
      env: { ...process.env } as Record<string, string>,
      version: '0.163.0',
    }),
  gateway: () => null,
  userMcpServers: () => Promise.resolve([]),
  version: () => '1.0.0',
  models: () => [
    {
      value: 'gpt-5.5',
      displayName: 'GPT-5.5',
      description: '',
      isDefault: true,
      efforts: ['low', 'medium', 'high'],
      defaultEffort: 'medium',
    },
  ],
  journalDir: join(dir, 'journals'),
})

/** Сессия движка на переводчике Codex и всё, что она услышала. */
const session = (sessionId: string, resume = false) => {
  const heard: CliMessage[] = []
  const asks: CardAsk[] = []
  const ended: CliMessage[] = []
  const errors: string[] = []
  const engine = new ScenarioSession(
    (spec, wires) => new CodexRunProcess(host(), spec, { cwd: dir, projectPath: dir }, wires),
    {
      sessionId,
      resume,
      model: '',
      effort: 'max',
      permissionMode: 'default',
      briefing: 'You are the head.',
      accountId: '',
    },
    {
      onMessage: (message) => heard.push(message),
      onTurnStarted: () => undefined,
      onTurnEnded: (result) => ended.push(result),
      onAsk: (ask) => asks.push(ask),
      onWithdrawn: () => undefined,
      onError: (message) => errors.push(message),
      onCrashed: () => errors.push('crashed'),
    },
  )

  return { engine, heard, asks, ended, errors }
}

const SESSION = '0f6e3a52-1b7c-4c1e-9a55-1c2d3e4f5a6b'

describe('прогон на Codex через переводчик', () => {
  it('ход: начало, живые слова, ответ, итог с расходом; бриф - указаниями потока', async () => {
    const run = session(SESSION)

    run.engine.sendPrompt('look')
    await expect.poll(() => run.ended.length).toBe(1)

    expect(run.errors).toEqual([])
    expect(run.engine.isTurnOpen).toBe(false)
    expect(run.heard.map((message) => message.type)).toEqual([
      'system',
      'stream_event',
      'stream_event',
      'assistant',
      'stream_event',
      'result',
    ])
    expect(run.ended[0]).toMatchObject({
      result: 'Done.',
      is_error: false,
      usage: { input_tokens: 400, cache_read_input_tokens: 600, output_tokens: 50 },
    })

    const sent = await calls()
    const started = sent.find((call) => call.method === 'thread/start')
    const turn = sent.find((call) => call.method === 'turn/start')

    expect(started?.params).toMatchObject({
      developerInstructions: 'You are the head.',
      approvalPolicy: 'untrusted',
    })
    // Пустая модель - модель Codex по умолчанию; чужой уровень (max) не шлётся.
    expect(turn?.params).toMatchObject({ model: 'gpt-5.5', effort: 'medium' })

    const journal = await readFile(join(dir, 'journals', `${SESSION}.jsonl`), 'utf8')

    expect(JSON.parse(journal.split('\n')[0] ?? '')).toMatchObject({ native: 't1' })
    expect(journal).toContain('"who":"model","text":"Done."')
    run.engine.stop()
  })

  it('вопрос на команду - Bash для головы; ответ «да» - accept у Codex', async () => {
    const run = session(SESSION)

    run.engine.sendPrompt('approve this')
    await expect.poll(() => run.asks.length).toBe(1)
    // Codex спрашивает о команде с обёрткой оболочки - голове она приходит без неё.
    expect(run.asks[0]).toMatchObject({ toolName: 'Bash', input: { command: 'ls -la' } })

    run.engine.answer(run.asks[0]?.requestId ?? '', true, '', run.asks[0]?.input ?? {})
    await expect.poll(() => run.ended.length).toBe(1)
    expect((await calls()).find((call) => call.id === 'ask-1')?.result).toEqual({
      decision: 'accept',
    })
    run.engine.stop()
  })

  it('лимит аккаунта - окно лимита и отметка лимита до итога с ошибкой', async () => {
    const run = session(SESSION)

    run.engine.sendPrompt('limit')
    await expect.poll(() => run.ended.length).toBe(1)

    const limit = run.heard.find((message) => message.type === 'rate_limit_event')

    expect(limit).toMatchObject({ rate_limit_info: { status: 'rejected', resetsAt: 2000000000 } })
    expect(run.heard.some((message) => message['error'] === 'rate_limit')).toBe(true)
    expect(run.ended[0]).toMatchObject({ is_error: true })
    run.engine.stop()
  })

  it('продолжение - тот же поток из журнала сессии', async () => {
    const first = session(SESSION)

    first.engine.sendPrompt('look')
    await expect.poll(() => first.ended.length).toBe(1)
    first.engine.stop()

    const again = session(SESSION, true)

    again.engine.sendPrompt('look again')
    await expect.poll(() => again.ended.length).toBe(1)
    expect((await calls()).find((call) => call.method === 'thread/resume')?.params).toMatchObject({
      threadId: 't1',
    })
    again.engine.stop()
  })
})

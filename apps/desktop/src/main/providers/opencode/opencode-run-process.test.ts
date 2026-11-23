import { rm, chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { journalPath } from '../run-stream/run-journal'
import type { CliMessage } from '../../claude/cli/cli-messages'
import type { CardAsk } from '../../scenarios/engine/run-mail'
import { ScenarioSession } from '../../scenarios/engine/scenario-session'
import type { OpenCodeRunHost } from './opencode-run-process'
import { openCodeSessionOf, OpenCodeRunProcess } from './opencode-run-process'

const SESSION = '0f6e3a52-1b7c-4c1e-9a55-1c2d3e4f5a6b'
const OWN = openCodeSessionOf(SESSION)

/**
 * Поддельный `opencode serve --stdio` по формам OpenCode 2.3.2: запросы - в calls.json. Ход
 * отвечает «Do» кусками и «Done.» целиком с расходом и ценой; со словом «approve» спрашивает
 * разрешение на команду `ls`; «helper» - субагент ses_child работает в фоне и спрашивает
 * разрешение сам.
 */
const FAKE_SERVER = `#!/usr/bin/env node
const http = require('node:http')
const fs = require('node:fs')
const OWN = '${OWN}'
const calls = []
let stream = null
let created = false
const emit = (type, data) => stream && stream.write('data: ' + JSON.stringify({ type, data }) + '\\n\\n')
const send = (type, data) => emit(type, { sessionID: OWN, ...data })
const finish = () => {
  send('session.text.delta', { assistantMessageID: 'msg_a', ordinal: 0, delta: 'Do' })
  send('session.text.ended', { assistantMessageID: 'msg_a', ordinal: 0, text: 'Done.' })
  send('session.step.ended', { assistantMessageID: 'msg_a', tokens: { input: 900, output: 100, reasoning: 20, cache: { read: 1000, write: 0 } }, cost: 0.002 })
  send('session.execution.succeeded', {})
}
const json = (res, body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
const server = http.createServer((req, res) => {
  if (req.url === '/api/event') {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    stream = res
    return res.write('data: {"type":"server.connected","data":{}}\\n\\n')
  }
  let raw = ''
  req.on('data', (chunk) => (raw += chunk))
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null
    calls.push({ method: req.method, url: req.url, body })
    fs.writeFileSync(__dirname + '/calls.json', JSON.stringify(calls))
    if (req.method === 'POST' && req.url === '/api/session') { created = true; return json(res, { data: { id: body.id } }) }
    if (req.method === 'GET' && req.url === '/api/session/' + OWN) return created ? json(res, { data: { id: OWN } }) : json(res, { message: 'no' }, 404)
    if (req.url.endsWith('/prompt')) {
      json(res, { data: { id: 'msg_u' } })
      send('session.execution.started', {})
      if (body.text.includes('approve')) {
        return send('permission.asked', { id: 'per_1', action: 'shell', resources: ['ls'], source: { type: 'tool', messageID: 'msg_a', id: 'call_1' } })
      }
      if (body.text.includes('connector')) {
        send('session.tool.called', { assistantMessageID: 'msg_a', id: 'call_m', name: 'execute', input: { code: 'return await tools.gmail.search_threads({ q: "invoice" })' } })
        send('session.tool.progress', { assistantMessageID: 'msg_a', id: 'call_m', metadata: { toolCalls: [{ tool: 'search', status: 'completed', input: { query: 'mail' } }, { tool: 'gmail.search_threads', status: 'running', input: { q: 'invoice' } }] } })
        return send('permission.asked', { id: 'per_1', action: 'gmail_search_threads', resources: ['*'], metadata: { input: { q: 'invoice' } }, source: { type: 'tool', messageID: 'msg_a', id: 'call_m' } })
      }
      if (body.text.includes('helper')) {
        emit('session.created', { sessionID: 'ses_child', parentID: OWN })
        emit('session.execution.started', { sessionID: 'ses_child' })
        return setTimeout(() => emit('permission.asked', { sessionID: 'ses_child', id: 'per_2', action: 'edit', resources: ['src/a.ts'] }), 30)
      }
      return finish()
    }
    if (req.url === '/api/session/' + OWN + '/permission/per_1/reply') {
      json(res, { data: true })
      send('permission.replied', { requestID: 'per_1', reply: body.decision })
      return finish()
    }
    if (req.url === '/api/session/ses_child/permission/per_2/reply') {
      json(res, { data: true })
      emit('permission.replied', { sessionID: 'ses_child', requestID: 'per_2', reply: body.decision })
      emit('session.execution.succeeded', { sessionID: 'ses_child' })
      return finish()
    }
    return json(res, { data: true })
  })
})
server.listen(0, '127.0.0.1', () => process.stdout.write(JSON.stringify({ url: 'http://127.0.0.1:' + server.address().port }) + '\\n'))
process.stdin.resume()
process.stdin.on('end', () => process.exit(0))
`

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'opencode-run-'))
  await writeFile(join(dir, 'opencode'), FAKE_SERVER)
  await chmod(join(dir, 'opencode'), 0o755)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

type Call = { method: string; url: string; body: Record<string, unknown> | null }

const calls = async (): Promise<Call[]> =>
  JSON.parse(await readFile(join(dir, 'calls.json'), 'utf8').catch(() => '[]')) as Call[]

const launched = (servers: readonly string[]) =>
  Promise.resolve({
    config: '{}',
    connectors: null,
    servers,
    allowedActions: [],
    env: {},
    compact: false,
    release: () => undefined,
  })

const host = (servers: readonly string[] = []): OpenCodeRunHost => ({
  cli: () =>
    Promise.resolve({
      binary: join(dir, 'opencode'),
      env: { ...(process.env as Record<string, string>), AW_PERSON: 'yes' },
      version: '2.3.2',
    }),
  dirs: () => ({
    config: join(dir, 'c'),
    data: join(dir, 'd'),
    state: join(dir, 's'),
    cache: join(dir, 'k'),
  }),
  launch: () => launched(servers),
  launchWith: () => launched(servers),
  models: () => [
    {
      value: 'ollama/gpt-oss:20b',
      displayName: 'gpt-oss:20b',
      description: '',
      efforts: ['low', 'medium', 'high'],
    },
  ],
  messages: () => Promise.resolve({ messages: [], cursor: null }),
  dropBrief: () => Promise.resolve(),
  journalDir: join(dir, 'journals'),
})

const session = (permissionMode = 'default', briefing = '', servers: readonly string[] = []) => {
  const heard: CliMessage[] = []
  const asks: CardAsk[] = []
  const ended: CliMessage[] = []
  const errors: string[] = []
  const engine = new ScenarioSession(
    (spec, wires) =>
      new OpenCodeRunProcess(host(servers), spec, { cwd: dir, projectPath: dir }, wires),
    {
      sessionId: SESSION,
      resume: false,
      model: '',
      effort: 'high',
      permissionMode,
      briefing,
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

describe('прогон на открытых моделях через переводчик', () => {
  it('ход: сессия с id от движка, бриф указаниями, ответ, итог с расходом и ценой', async () => {
    const run = session('default', 'You are the head.')

    run.engine.sendPrompt('look')
    await expect.poll(() => run.ended.length).toBe(1)

    expect(run.errors).toEqual([])
    expect(run.ended[0]).toMatchObject({
      result: 'Done.',
      is_error: false,
      total_cost_usd: 0.002,
      usage: { input_tokens: 900, output_tokens: 120, cache_read_input_tokens: 1000 },
    })

    const sent = await calls()

    expect(sent.find((call) => call.url === '/api/session')?.body).toMatchObject({
      id: OWN,
      location: { directory: dir },
      agent: 'build',
      model: { providerID: 'ollama', id: 'gpt-oss:20b', variant: 'high' },
    })
    expect(sent.some((call) => call.url.includes('/instructions/entries/'))).toBe(true)
    expect(sent.find((call) => call.url.endsWith('/environment'))?.body).toMatchObject({
      variables: { AW_PERSON: 'yes' },
    })
    run.engine.stop()
  })

  it('вопрос на команду - Bash для головы; отказ - reject у OpenCode', async () => {
    const run = session()

    run.engine.sendPrompt('approve this')
    await expect.poll(() => run.asks.length).toBe(1)
    expect(run.asks[0]).toMatchObject({ toolName: 'Bash', input: { command: 'ls' } })

    run.engine.answer(run.asks[0]?.requestId ?? '', false, 'no', {})
    await expect.poll(() => run.ended.length).toBe(1)
    expect(
      (await calls()).find((call) => call.url.endsWith('/permission/per_1/reply'))?.body,
    ).toEqual({ decision: 'reject' })
    run.engine.stop()
  })

  it('Code Mode: вопрос о вызове коннектора из кода - его именем MCP, в журнале - сам вызов', async () => {
    const run = session('default', '', ['gmail'])

    run.engine.sendPrompt('use the connector')
    await expect.poll(() => run.asks.length).toBe(1)
    // Правила прогона на коннекторы пишутся именами Claude: mcp__<сервер>__<инструмент>.
    expect(run.asks[0]).toMatchObject({
      toolName: 'mcp__gmail__search_threads',
      input: { q: 'invoice' },
    })

    run.engine.answer(run.asks[0]?.requestId ?? '', true, '', {})
    await expect.poll(() => run.ended.length).toBe(1)

    await expect
      .poll(() => readFile(journalPath(join(dir, 'journals'), SESSION), 'utf8').catch(() => ''))
      .toContain('gmail_search_threads {\\"q\\":\\"invoice\\"}')

    const said = await readFile(journalPath(join(dir, 'journals'), SESSION), 'utf8')

    // Код Code Mode и поиск инструментов в журнал не идут.
    expect(said).not.toContain('tools.gmail')
    expect(said).not.toContain('query')
    run.engine.stop()
  })

  it('субагент в фоне - фоновый помощник движка; его вопрос - вопрос прогона', async () => {
    const run = session('acceptEdits')

    run.engine.sendPrompt('use a helper')
    await expect.poll(() => run.asks.length).toBe(1)
    expect(run.heard).toContainEqual({
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: [{ task_id: 'ses_child', task_type: 'local_agent' }],
    })
    expect(run.asks[0]).toMatchObject({
      toolName: 'Edit',
      input: { file_path: join(dir, 'src/a.ts') },
    })

    run.engine.answer(run.asks[0]?.requestId ?? '', true, '', run.asks[0]?.input ?? {})
    await expect.poll(() => run.ended.length).toBe(1)

    const sent = await calls()

    expect(
      sent.some((call) => call.method === 'PATCH' && call.url === '/api/session/ses_child'),
    ).toBe(true)
    expect(sent.find((call) => call.url.endsWith('/permission/per_2/reply'))?.body).toEqual({
      decision: 'once',
    })
    expect(run.heard).toContainEqual({
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: [],
    })
    run.engine.stop()
  })
})

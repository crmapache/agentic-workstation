import { rm, chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { PermissionMode } from '@shared/conversation'

import { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { freshConversation } from '../../agents/panel/panel-state'
import type { OpenCodeHost } from './opencode-conversation'
import { openCodeOf } from './opencode-conversation'
import { openCodeDriver } from './opencode-driver'
import { isCompactWindow } from './opencode-instructions'

/**
 * Поддельный `opencode serve --stdio` по формам живого OpenCode 2.3.2: сессия ses_1, запросы -
 * в calls.json. Сообщение отвечает текстом и вызовом `read`; со словом «edit» - сначала
 * спрашивает разрешение на правку и ждёт ответа; «ask» - форма инструмента question (id сессии -
 * внутри формы); «sub» - субагент ses_child: его ход идёт своей сессией, он спрашивает разрешение
 * на команду; «interrupt» висит, пока ход не прервут.
 */
const FAKE_SERVER = `#!/usr/bin/env node
const http = require('node:http')
const fs = require('node:fs')
const calls = []
let stream = null
let waiting = null
const emit = (type, data) => stream && stream.write('data: ' + JSON.stringify({ type, location: { directory: '/p' }, data }) + '\\n\\n')
const send = (type, data) => emit(type, { sessionID: 'ses_1', ...data })
const finish = () => {
  send('session.text.started', { assistantMessageID: 'msg_a', ordinal: 0 })
  send('session.text.delta', { assistantMessageID: 'msg_a', ordinal: 0, delta: 'Do' })
  send('session.text.ended', { assistantMessageID: 'msg_a', ordinal: 0, text: 'Done.' })
  send('session.step.ended', { assistantMessageID: 'msg_a', tokens: { input: 900, output: 100, cache: { read: 1000, write: 0 } } })
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
    if (req.method === 'POST' && req.url === '/api/session') return json(res, { data: { id: 'ses_1' } })
    if (req.method === 'GET' && req.url.startsWith('/api/session/')) return json(res, { _tag: 'NotFound', message: 'no' }, 404)
    if (req.url.endsWith('/prompt')) {
      json(res, { data: { id: 'msg_u' } })
      send('session.execution.started', {})
      send('session.tool.input.started', { assistantMessageID: 'msg_a', id: 'call_1', name: 'read' })
      send('session.tool.called', { assistantMessageID: 'msg_a', id: 'call_1', input: { path: 'src/a.ts', offset: 1 } })
      send('session.tool.success', { assistantMessageID: 'msg_a', id: 'call_1', content: [{ type: 'text', text: '1: x' }], metadata: {} })
      if (body.text.includes('interrupt')) return
      if (body.text.includes('ask')) {
        return emit('form.created', { form: { id: 'frm_1', sessionID: 'ses_1', title: 'Questions', fields: [
          { key: 'q0', title: 'Color', description: 'Which color?', type: 'string', custom: true, options: [{ value: 'r', label: 'Red' }, { value: 'b', label: 'Blue' }] },
          { key: 'q1', title: 'Sizes', description: 'Which sizes?', type: 'multiselect', options: [{ value: 's', label: 'Small' }, { value: 'l', label: 'Large' }] },
        ] } })
      }
      if (body.text.includes('sub')) {
        emit('session.created', { sessionID: 'ses_child', parentID: 'ses_1', projectID: 'p', location: { directory: '/p' }, slug: 'x', version: '2.3.2' })
        emit('session.execution.started', { sessionID: 'ses_child' })
        emit('session.text.ended', { sessionID: 'ses_child', assistantMessageID: 'msg_c', ordinal: 0, text: 'child' })
        return setTimeout(() => emit('permission.asked', { sessionID: 'ses_child', id: 'per_2', action: 'shell', resources: ['ls'], source: { type: 'tool', messageID: 'msg_c', id: 'call_c' } }), 50)
      }
      if (body.text.includes('codemode')) {
        send('session.tool.input.started', { assistantMessageID: 'msg_a', id: 'call_s', name: 'execute' })
        send('session.tool.called', { assistantMessageID: 'msg_a', id: 'call_s', input: { code: 'return await search({ query: "mail" })' } })
        send('session.tool.progress', { assistantMessageID: 'msg_a', id: 'call_s', metadata: { toolCalls: [{ tool: 'search', status: 'running', input: { query: 'mail' } }] } })
        send('session.tool.success', { assistantMessageID: 'msg_a', id: 'call_s', content: [{ type: 'text', text: '[]' }], metadata: { toolCalls: [{ tool: 'search', status: 'completed', input: { query: 'mail' } }] } })
        send('session.tool.input.started', { assistantMessageID: 'msg_a', id: 'call_m', name: 'execute' })
        send('session.tool.called', { assistantMessageID: 'msg_a', id: 'call_m', input: { code: 'return await tools.gmail.search_threads({ q: "invoice" })' } })
        send('session.tool.progress', { assistantMessageID: 'msg_a', id: 'call_m', metadata: { toolCalls: [{ tool: 'gmail.search_threads', status: 'running', input: { q: 'invoice' } }] } })
        return send('permission.asked', { id: 'per_3', action: 'gmail_search_threads', resources: ['*'], save: ['*'], metadata: { input: { q: 'invoice' } }, source: { type: 'tool', messageID: 'msg_a', id: 'call_m' } })
      }
      if (body.text.includes('edit')) {
        waiting = 'per_1'
        return send('permission.asked', { id: 'per_1', action: 'edit', resources: ['src/a.ts'], save: ['*'], source: { type: 'tool', messageID: 'msg_a', id: 'call_2' }, metadata: { files: [{ file: 'src/a.ts', patch: '@@ -1 +1 @@\\n-x\\n+y\\n' }] } })
      }
      return finish()
    }
    if (req.url.endsWith('/permission/per_1/reply')) {
      json(res, { data: true })
      send('permission.replied', { requestID: 'per_1', reply: body.decision })
      return finish()
    }
    if (req.url.endsWith('/permission/per_3/reply')) {
      json(res, { data: true })
      send('permission.replied', { requestID: 'per_3', reply: body.decision })
      send('session.tool.success', { assistantMessageID: 'msg_a', id: 'call_m', content: [{ type: 'text', text: '{"threads":1}' }], metadata: { toolCalls: [{ tool: 'gmail.search_threads', status: 'completed', input: { q: 'invoice' } }] } })
      return finish()
    }
    if (req.url === '/api/session/ses_1/form/frm_1/reply') {
      json(res, { data: true })
      emit('form.replied', { id: 'frm_1', sessionID: 'ses_1', answer: body.answer })
      return finish()
    }
    if (req.url === '/api/session/ses_child/permission/per_2/reply') {
      json(res, { data: true })
      emit('session.execution.succeeded', { sessionID: 'ses_child' })
      emit('permission.replied', { sessionID: 'ses_child', requestID: 'per_2', reply: body.decision })
      return finish()
    }
    if (req.url.endsWith('/interrupt')) {
      json(res, { data: true })
      return send('session.execution.interrupted', {})
    }
    return json(res, { data: true })
  })
})
server.listen(0, '127.0.0.1', () => process.stdout.write(JSON.stringify({ url: 'http://127.0.0.1:' + server.address().port }) + '\\n'))
process.stdin.resume()
process.stdin.on('end', () => process.exit(0))
`

type Call = { method: string; url: string; body: Record<string, unknown> | null }

let dir = ''
let binary = ''

beforeEach(async () => {
  launches = []
  dir = await mkdtemp(join(tmpdir(), 'opencode-runtime-'))
  binary = join(dir, 'opencode')
  await writeFile(binary, FAKE_SERVER)
  await chmod(binary, 0o755)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const calls = async (): Promise<Call[]> =>
  JSON.parse(await readFile(join(dir, 'calls.json'), 'utf8').catch(() => '[]')) as Call[]

/** Модели, на которых поднимались процессы, - по порядку. */
let launches: (string | null)[] = []

/**
 * windows - окно модели панели; нет - 131 072 (полные указания). Процесс поднимается
 * компактным по окну своей модели, как у сервиса панели.
 */
const makeRuntime = (
  permissionMode: PermissionMode = 'acceptEdits',
  servers: readonly string[] = [],
  windows: Record<string, number> = {},
) => {
  const windowOf = (model: string) => windows[model] ?? 131072
  const host: OpenCodeHost = {
    driver: openCodeDriver(() => host),
    cli: () =>
      Promise.resolve({
        binary,
        env: { ...(process.env as Record<string, string>), AW_PERSON: 'yes' },
        version: '2.3.2',
      }),
    onFeedPatch: () => undefined,
    dirs: () => ({
      config: join(dir, 'c'),
      data: join(dir, 'd'),
      state: join(dir, 's'),
      cache: join(dir, 'k'),
    }),
    launch: (_projectPath, model) => {
      launches.push(model)

      return Promise.resolve({
        config: '{}',
        connectors: null,
        servers,
        allowedActions: [],
        env: {},
        compact: isCompactWindow(windowOf(model || 'ollama/gpt-oss:20b')),
        release: () => undefined,
      })
    },
    defaultModel: () => 'ollama/gpt-oss:20b',
    contextWindow: windowOf,
    efforts: () => [],
    messages: () => Promise.resolve({ messages: [], cursor: null }),
    onChange: () => undefined,
    onCommands: () => undefined,
    thumbnail: () => '',
    accountId: () => '',
    onCall: () => undefined,
  }

  return new ConversationRuntime(
    freshConversation({
      id: 'c1',
      projectPath: dir,
      sessionId: '',
      title: '',
      model: null,
      effort: null,
      permissionMode,
      queue: [],
      fork: null,
      updatedAt: 0,
    }),
    host,
  )
}

describe('разговор OpenCode на ядре', () => {
  it('ход: новая сессия в папке проекта, вызов, ответ, конец хода, окно контекста', async () => {
    const runtime = makeRuntime()

    await runtime.send({ text: 'look', images: [] })
    await expect.poll(() => runtime.meta.outcome).toBe('done')
    expect(runtime.meta.status).toBe('idle')

    const items = openCodeOf(runtime).feed.builder.items

    expect(runtime.meta.sessionId).toBe('ses_1')
    expect(items.map((item) => item.kind)).toEqual(['user', 'tool', 'assistant', 'turn'])
    expect(items[1]).toMatchObject({
      action: { kind: 'read', path: join(dir, 'src/a.ts') },
      status: 'done',
    })
    expect(items[2]).toMatchObject({ text: 'Done.', streaming: false })
    expect(runtime.meta.usage).toEqual({ contextTokens: 2000, contextWindow: 131072 })

    const sent = await calls()
    const created = sent.find((call) => call.url === '/api/session')
    const environment = sent.find((call) => call.url.endsWith('/environment'))

    // Командам агента - окружение человека, без своих папок IDE и конфига OpenCode.
    expect(environment?.method).toBe('PUT')
    expect(environment?.body?.['variables']).toMatchObject({ AW_PERSON: 'yes' })

    expect(created?.body).toMatchObject({
      location: { directory: dir },
      agent: 'build',
      model: { providerID: 'ollama', id: 'gpt-oss:20b' },
    })
    await runtime.dispose()
  })

  it('разрешение на правку - карточкой с диффом; «для этого разговора» - правилом сессии', async () => {
    const runtime = makeRuntime('default')

    await runtime.send({ text: 'edit it', images: [] })
    await expect.poll(() => runtime.meta.status).toBe('waiting')
    expect(runtime.meta.pending).toMatchObject({
      kind: 'permission',
      toolUseId: 'call_2',
      action: { kind: 'edit', path: join(dir, 'src/a.ts'), preview: [{ lines: ['-x', '+y'] }] },
    })

    runtime.respond(runtime.meta.pending?.requestId ?? '', {
      kind: 'permission',
      decision: { behavior: 'allowAlways' },
    })
    await expect.poll(() => runtime.meta.outcome).toBe('done')

    const sent = await calls()

    expect(sent.find((call) => call.url.endsWith('/reply'))?.body).toEqual({ decision: 'once' })
    const rules = sent.find((call) => call.method === 'PATCH')?.body?.['permissions']

    expect(rules).toContainEqual({ action: 'edit', resource: '*', effect: 'allow' })
    await runtime.dispose()
  })

  it('Code Mode: поиск инструментов не виден, вызов коннектора - своей строкой и карточкой', async () => {
    const runtime = makeRuntime('default', ['gmail'])

    await runtime.send({ text: 'codemode', images: [] })
    await expect.poll(() => runtime.meta.status).toBe('waiting')
    // Источник вопроса - весь код, а карточка - о вызове коннектора внутри него.
    expect(runtime.meta.pending).toMatchObject({
      kind: 'permission',
      toolUseId: 'call_m',
      toolName: 'gmail_search_threads',
      input: { q: 'invoice' },
      action: { kind: 'mcp', server: 'gmail', tool: 'search_threads', target: '{"q":"invoice"}' },
    })

    runtime.respond(runtime.meta.pending?.requestId ?? '', {
      kind: 'permission',
      decision: { behavior: 'allowAlways' },
    })
    await expect.poll(() => runtime.meta.outcome).toBe('done')

    const items = openCodeOf(runtime).feed.builder.items

    expect(items.find((item) => item.id === 'call_s')).toMatchObject({ action: { kind: 'todo' } })
    expect(items.find((item) => item.id === 'call_m')).toMatchObject({
      action: { kind: 'mcp', server: 'gmail', tool: 'search_threads' },
      status: 'done',
      result: { text: '{"threads":1}' },
    })

    const rules = (await calls()).find((call) => call.method === 'PATCH')?.body?.['permissions']

    // «Для этого разговора» - тем же действием, каким OpenCode спрашивает о вызове из кода.
    expect(rules).toContainEqual({ action: 'gmail_search_threads', resource: '*', effect: 'allow' })
    await runtime.dispose()
  })

  it('модель через границу окна - процесс заново до следующего хода, по эту сторону - тот же', async () => {
    const runtime = makeRuntime('acceptEdits', [], {
      'ollama/qwen3.8': 65_536,
      'ollama/gpt-oss:20b': 65_536,
      'openrouter/big': 1_000_000,
    })

    runtime.setOptions({ model: 'ollama/qwen3.8' })
    await runtime.send({ text: 'look', images: [] })
    await expect.poll(() => runtime.meta.outcome).toBe('done')
    expect(openCodeOf(runtime).compact).toBe(true)

    // Другая модель с маленьким окном: указания те же - процесс остаётся.
    runtime.setOptions({ model: 'ollama/gpt-oss:20b' })
    await runtime.send({ text: 'look', images: [] })
    await expect
      .poll(() => runtime.feed.builder.items.filter((i) => i.kind === 'turn').length)
      .toBe(2)
    expect(launches).toEqual(['ollama/qwen3.8'])

    // Большое окно - полные указания: процесс поднимается заново на новой модели.
    runtime.setOptions({ model: 'openrouter/big' })
    await runtime.send({ text: 'look', images: [] })
    await expect.poll(() => launches).toEqual(['ollama/qwen3.8', 'openrouter/big'])
    await expect.poll(() => openCodeOf(runtime).compact).toBe(false)
    await runtime.dispose()
  })

  it('форма 2.3.2: вопрос из описания, варианты одного и нескольких, ответ - значениями', async () => {
    const runtime = makeRuntime()

    await runtime.send({ text: 'ask me', images: [] })
    await expect.poll(() => runtime.meta.status).toBe('waiting')
    expect(runtime.meta.pending).toMatchObject({
      kind: 'question',
      questions: [
        {
          question: 'Which color?',
          header: 'Color',
          options: [{ label: 'Red' }, { label: 'Blue' }],
          multiSelect: false,
          other: true,
        },
        { question: 'Which sizes?', multiSelect: true, other: false },
      ],
    })

    runtime.respond(runtime.meta.pending?.requestId ?? '', {
      kind: 'question',
      answers: { 'Which color?': 'Blue', 'Which sizes?': 'Small, Large' },
    })
    await expect.poll(() => runtime.meta.outcome).toBe('done')

    const reply = (await calls()).find((call) => call.url.endsWith('/form/frm_1/reply'))

    expect(reply?.body).toEqual({ answer: { q0: 'b', q1: ['s', 'l'] } })
    await runtime.dispose()
  })

  it('субагент: правила режима - и ему, его вопрос - в карточку, ответ - его сессии', async () => {
    const runtime = makeRuntime('readOnly')

    await runtime.send({ text: 'run a subagent', images: [] })
    await expect.poll(() => runtime.meta.status).toBe('waiting')
    // Ход субагента идёт своей сессией: ни его текст, ни его ход в ленту разговора не попадают,
    // а сам он - фоновая работа разговора.
    expect(runtime.turnActive).toBe(true)
    expect(runtime.meta.backgroundWork).toBe(true)
    expect(openCodeOf(runtime).feed.builder.items.some((item) => item.id.includes('msg_c'))).toBe(
      false,
    )
    expect(runtime.meta.pending).toMatchObject({
      kind: 'permission',
      action: { kind: 'command', command: 'ls' },
    })

    runtime.respond(runtime.meta.pending?.requestId ?? '', {
      kind: 'permission',
      decision: { behavior: 'deny', message: '' },
    })
    await expect.poll(() => runtime.meta.outcome).toBe('done')
    expect(runtime.meta.backgroundWork).toBe(false)

    const sent = await calls()
    const childRules = sent.find(
      (call) => call.method === 'PATCH' && call.url === '/api/session/ses_child',
    )

    expect(childRules?.body?.['permissions']).toContainEqual(
      expect.objectContaining({ action: 'edit', effect: 'deny' }),
    )
    expect(sent.some((call) => call.url === '/api/session/ses_child/permission/per_2/reply')).toBe(
      true,
    )
    await runtime.dispose()
  })

  it('Stop - прерывание у OpenCode, ход кончается прерванным', async () => {
    const runtime = makeRuntime()

    await runtime.send({ text: 'interrupt me', images: [] })
    await expect.poll(() => runtime.meta.status).toBe('running')

    runtime.interrupt()
    await expect.poll(() => runtime.meta.status).toBe('idle')
    expect((await calls()).some((call) => call.url.endsWith('/interrupt'))).toBe(true)
    await runtime.dispose()
  })
})

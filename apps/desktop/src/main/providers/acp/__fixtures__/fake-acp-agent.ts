import { chmod, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { AcpRunHost } from '../acp-run-host'
import { kimiAgent } from '../../../kimi/kimi-agent'
import type { GatewayLaunch } from '../../../connectors/gateway/launches'

/**
 * Поддельный `kimi acp` по формам живой записи Kimi 2.7 (acp/__fixtures__/kimi-session.ndjson):
 * JSON-RPC 2.0 построчно, всё пришедшее - в calls.json рядом. Разговоры - в sessions.json, так
 * что второй процесс продолжает разговор первого (`session/resume`). Файл signed-out - отказ
 * `-32000 Authentication required` на `session/new`. Ход по словам сообщения:
 * - «json» - ответ JSON кусками;
 * - «command» - «Let me look.», вызов Bash и вопрос разрешения (у вопроса нет `kind`, как у Kimi),
 *   после ответа - «Listed.» или «Refused.»; с «long» ход ждёт `session/cancel`;
 * - «plan» - `ExitPlanMode` вопросом с вариантами `plan_*` и текстом плана;
 * - «edit» - правка вопросом, следом выход из плана, ответ «Stayed.»;
 * - «question» - `elicitation/create` с формой, ответ называет выбранное;
 * - иначе - размышление и «Done.» кусками.
 * Список - страницами по два, повтор - сообщение человека и «Done.», форк - id с «-fork».
 */
const FAKE_AGENT = String.raw`#!/usr/bin/env node
const readline = require('node:readline')
const fs = require('node:fs')
const path = require('node:path')
const file = (name) => path.join(__dirname, name)
const read = (name, empty) => (fs.existsSync(file(name)) ? JSON.parse(fs.readFileSync(file(name), 'utf8')) : empty)
const record = (message) => fs.writeFileSync(file('calls.json'), JSON.stringify([...read('calls.json', []), message]))
const out = (value) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n')
const state = { model: 'k3', thinking: 'on', mode: 'default' }
const select = (id, category, values) => ({ type: 'select', id, name: id, category, currentValue: state[id], options: values.map((value) => ({ value, name: value })) })
const config = () => [select('model', 'model', ['k3', 'k3-turbo']), select('thinking', 'thought_level', ['off', 'on']), select('mode', 'mode', ['default', 'plan', 'auto', 'yolo'])]
const TOOL = [{ optionId: 'approve_once', name: 'Approve once', kind: 'allow_once' }, { optionId: 'approve_always', name: 'Approve for this session', kind: 'allow_always' }, { optionId: 'reject', name: 'Reject', kind: 'reject_once' }]
const PLAN = [{ optionId: 'plan_approve', name: 'Approve', kind: 'allow_once' }, { optionId: 'plan_revise', name: 'Revise', kind: 'reject_once' }, { optionId: 'plan_reject_and_exit', name: 'Reject and Exit', kind: 'reject_once' }]
let sid = ''
let prompt = null
let asked = 100
const waiting = new Map()
const update = (body) => out({ method: 'session/update', params: { sessionId: sid, update: body } })
const say = (text) => update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } })
const end = (stopReason) => { if (prompt === null) return; out({ id: prompt, result: { stopReason: stopReason || 'end_turn' } }); prompt = null }
const ask = (method, params, then) => { asked += 1; waiting.set(asked, then); out({ id: asked, method, params: { sessionId: sid, ...params } }) }
const call = (toolCallId, title, kind, input) => update({ sessionUpdate: 'tool_call', toolCallId, title, kind, status: 'pending', content: [{ type: 'content', content: { type: 'text', text: JSON.stringify(input) } }] })
const permission = (toolCallId, title, options, text, then) => ask('session/request_permission', { options, toolCall: { toolCallId, title, content: [{ type: 'content', content: { type: 'text', text } }] } }, then)
const chosen = (reply) => (reply.result && reply.result.outcome && reply.result.outcome.optionId) || 'cancelled'
const turn = (text) => {
  if (text.includes('json')) { say('{"message":"Hi",'); say('"ok":true}'); return end() }
  if (text.includes('command')) {
    say('Let me look.')
    call('1:call_bash', 'Bash', 'execute', { command: 'ls -1', description: 'List files' })
    return permission('1:call_bash', 'Bash', TOOL, 'Requesting approval to Running: ls -1', (reply) => {
      if (text.includes('long')) return
      const ok = chosen(reply) === 'approve_once'
      update({ sessionUpdate: 'tool_call_update', toolCallId: '1:call_bash', status: ok ? 'completed' : 'failed' })
      say(ok ? 'Listed.' : 'Refused.')
      end()
    })
  }
  if (text.includes('edit')) {
    call('3:call_edit', 'Edit', 'edit', { path: 'a.txt', old_string: 'a', new_string: 'b' })
    return permission('3:call_edit', 'Edit', TOOL, 'Requesting approval to Edit a.txt', () => {
      call('3:call_plan', 'ExitPlanMode', 'other', {})
      permission('3:call_plan', 'ExitPlanMode', PLAN, '1. Edit a.txt', () => { say('Stayed.'); end() })
    })
  }
  if (text.includes('plan')) {
    call('2:call_plan', 'ExitPlanMode', 'other', {})
    return permission('2:call_plan', 'ExitPlanMode', PLAN, 'Plan saved.\n\n1. Step 1', () => { say('Planned.'); end() })
  }
  if (text.includes('question')) {
    call('4:call_ask', 'AskUserQuestion', 'other', { questions: [] })
    const schema = { type: 'object', properties: { q0: { type: 'string', title: 'Color', oneOf: [{ const: 'red', title: 'Red' }, { const: 'blue', title: 'Blue' }] } }, required: ['q0'] }
    return ask('elicitation/create', { toolCallId: '4:call_ask', mode: 'form', message: 'Which color do you prefer?', requestedSchema: schema }, (reply) => { say('You chose ' + JSON.stringify(reply.result)); end() })
  }
  update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Thinking.' } })
  say('Do')
  say('ne.')
  end()
}
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  record(message)
  if (message.method === undefined) {
    const then = waiting.get(message.id)
    waiting.delete(message.id)
    return then && then(message)
  }
  const reply = (result) => out({ id: message.id, result })
  switch (message.method) {
    case 'initialize':
      return reply({ protocolVersion: 1, agentCapabilities: { loadSession: true, sessionCapabilities: { list: {}, resume: {}, close: {}, delete: {}, fork: {} }, mcpCapabilities: { http: true } } })
    case 'session/new':
      if (fs.existsSync(file('signed-out'))) return out({ id: message.id, error: { code: -32000, message: 'Authentication required' } })
      sid = 'session_' + (read('sessions.json', []).length + 1)
      fs.writeFileSync(file('sessions.json'), JSON.stringify([...read('sessions.json', []), sid]))
      fs.writeFileSync(file('places.json'), JSON.stringify({ ...read('places.json', {}), [sid]: message.params.cwd }))
      return reply({ sessionId: sid, configOptions: config() })
    case 'session/list': {
      const all = read('sessions.json', []).map((id, at) => ({ sessionId: id, cwd: read('places.json', {})[id] || '/elsewhere', title: 'Chat ' + id, updatedAt: new Date(Date.UTC(2026, 10, 19, 0, at)).toISOString() }))
      const from = Number(message.params.cursor || 0)
      return reply({ sessions: all.slice(from, from + 2), nextCursor: from + 2 < all.length ? String(from + 2) : null })
    }
    case 'session/load':
      sid = message.params.sessionId
      update({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'hello ' + sid } })
      say('Done.')
      return reply({ configOptions: config() })
    case 'session/fork': {
      const forked = message.params.sessionId + '-fork'
      fs.writeFileSync(file('sessions.json'), JSON.stringify([...read('sessions.json', []), forked]))
      return reply({ sessionId: forked, configOptions: config() })
    }
    case 'session/resume':
      if (!read('sessions.json', []).includes(message.params.sessionId)) return out({ id: message.id, error: { code: -32002, message: 'Session not found' } })
      sid = message.params.sessionId
      return reply({ configOptions: config() })
    case 'session/set_config_option':
      state[message.params.configId] = message.params.value
      return reply({ configOptions: config() })
    case 'session/prompt':
      prompt = message.id
      return turn(message.params.prompt.map((block) => block.text || '').join('\n'))
    case 'session/cancel':
      return end('cancelled')
    case 'session/delete':
    case 'session/close':
      return reply({})
    default:
      return out({ id: message.id, error: { code: -32601, message: 'Unknown method' } })
  }
}).on('close', () => process.exit(0))
`

/** Поддельный агент - исполняемым файлом в папке теста. */
export const installFakeAgent = async (dir: string): Promise<string> => {
  const binary = join(dir, 'kimi')

  await writeFile(binary, FAKE_AGENT)
  await chmod(binary, 0o755)

  return binary
}

/** Всё, что агент получил от IDE: запросы, уведомления и ответы на его вопросы. */
export type FakeCall = {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
}

export const fakeCalls = async (dir: string): Promise<FakeCall[]> =>
  JSON.parse(await readFile(join(dir, 'calls.json'), 'utf8').catch(() => '[]')) as FakeCall[]

/** Запросы агенту одним методом, по порядку. */
export const callsOf = (calls: readonly FakeCall[], method: string): FakeCall[] =>
  calls.filter((call) => call.method === method)

/** Ответ IDE на вопрос агента с этим id. */
export const replyTo = (calls: readonly FakeCall[], id: number): FakeCall | undefined =>
  calls.find((call) => call.id === id && call.method === undefined)

/**
 * Хозяин прогона на поддельном агенте с настоящим описанием Kimi: шлюз отдаёт один коннектор и
 * правило «уведомления без вопроса», signedOut считается.
 */
export const fakeRunHost = (
  dir: string,
  seen: { signedOut: number; released: number } = { signedOut: 0, released: 0 },
): AcpRunHost => {
  const launch: GatewayLaunch = {
    servers: [],
    token: 'key',
    allowed: ['mcp__notifications'],
    own: () => undefined,
    release: () => {
      seen.released += 1
    },
    idle: () => undefined,
    end: () => undefined,
  }

  return {
    agent: kimiAgent(join(dir, 'kimi-root')),
    label: 'Kimi Code',
    cli: () =>
      Promise.resolve({
        binary: join(dir, 'kimi'),
        version: '2.7.0',
        env: process.env as Record<string, string>,
      }),
    connectors: () => ({
      servers: [
        {
          type: 'http',
          name: 'gmail',
          url: 'http://127.0.0.1:1/mcp',
          headers: [{ name: 'Authorization', value: 'Bearer key' }],
        },
      ],
      launch,
    }),
    signedOut: () => {
      seen.signedOut += 1
    },
    version: '0.0.0',
    journalDir: join(dir, 'journals'),
  }
}

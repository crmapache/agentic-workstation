import { rm, chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { ModelInfo } from '@shared/conversation'
import { fastModeShown } from '@shared/fast-mode'

import { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { freshConversation } from '../../agents/panel/panel-state'
import type { CodexHost } from './codex-conversation'
import { codexOf } from './codex-conversation'
import { codexDriver } from './codex-driver'
import { fastReportOf } from './codex-fast'

/**
 * Поддельный `codex app-server` с уровнем обслуживания, как замерено на 0.163: уровень
 * конфига - CONFIG_TIER; просьба `serviceTier` у открытия потока и хода принимается, если
 * у модели он есть (FAST_OK=1), иначе молча выбрасывается. Принятая смена - уведомлением
 * `thread/settings/updated`; запросы ходов - в turns.json.
 */
const FAKE_SERVER = `#!/usr/bin/env node
const fs = require('node:fs')
const readline = require('node:readline')
const out = (value) => process.stdout.write(JSON.stringify(value) + '\\n')
const ok = process.env.FAST_OK === '1'
let tier = process.env.CONFIG_TIER || null
let turns = 0
const sent = []
const take = (asked) => {
  if (asked === undefined || asked === null) return false
  if (asked === 'priority' && !ok) return false
  if (asked === tier) return false
  tier = asked
  return true
}
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') return out({ id: message.id, result: {} })
  if (message.method === 'thread/start') {
    fs.writeFileSync(__dirname + '/start.json', JSON.stringify(message.params))
    take(message.params.serviceTier)
    return out({ id: message.id, result: { thread: { id: 't1' }, serviceTier: tier } })
  }
  if (message.method === 'turn/start') {
    turns += 1
    sent.push(message.params)
    fs.writeFileSync(__dirname + '/turns.json', JSON.stringify(sent))
    const turn = (status) => ({ id: 'turn-' + turns, status, items: [] })
    out({ id: message.id, result: { turn: turn('inProgress') } })
    out({ method: 'turn/started', params: { threadId: 't1', turn: turn('inProgress') } })
    if (take(message.params.serviceTier)) {
      out({ method: 'thread/settings/updated', params: { threadId: 't1', threadSettings: { serviceTier: tier } } })
    }
    out({ method: 'item/completed', params: { threadId: 't1', turnId: 'turn-' + turns, item: { type: 'agentMessage', id: 'm' + turns, text: 'Done.' } } })
    return out({ method: 'turn/completed', params: { threadId: 't1', turn: turn('completed') } })
  }
  if (message.method && message.id !== undefined) return out({ id: message.id, result: {} })
}).on('close', () => process.exit(0))
`

let dir = ''
let binary = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'codex-fast-'))
  binary = join(dir, 'codex')
  await writeFile(binary, FAKE_SERVER)
  await chmod(binary, 0o755)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const MODELS: ModelInfo[] = [
  { value: 'gpt-fast', displayName: 'Fast', description: '', isDefault: true, fast: true },
  { value: 'gpt-slow', displayName: 'Slow', description: '', isDefault: false, fast: false },
]

const makeRuntime = (env: { CONFIG_TIER?: string; FAST_OK: '0' | '1' }) => {
  const host: CodexHost = {
    driver: codexDriver(() => host),
    cli: () =>
      Promise.resolve({
        binary,
        env: { ...(process.env as Record<string, string>), CONFIG_TIER: '', ...env },
        version: '0.163.0',
      }),
    onFeedPatch: () => undefined,
    version: () => '0.0.0',
    model: (id) => MODELS.find((model) => (id ? model.value === id : model.isDefault)) ?? null,
    turns: () => Promise.resolve({ turns: [], nextCursor: null }),
    onUsageChanged: () => undefined,
    connectors: () => null,
    userMcpServers: () => Promise.resolve([]),
    isTrusted: () => Promise.resolve(true),
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
      permissionMode: 'acceptEdits',
      queue: [],
      fork: null,
      updatedAt: 0,
    }),
    host,
  )
}

const json = async <T>(name: string): Promise<T> =>
  JSON.parse(await readFile(join(dir, name), 'utf8')) as T

const turn = async (runtime: ConversationRuntime, text: string, count: number) => {
  await runtime.send({ text, images: [] })
  await expect
    .poll(async () => (await json<unknown[]>('turns.json').catch(() => [])).length)
    .toBe(count)
  await expect.poll(() => runtime.meta.status).toBe('idle')
}

const shown = (runtime: ConversationRuntime) =>
  fastModeShown(runtime.meta.fastMode, runtime.meta.fastReport)

const fastNotices = (runtime: ConversationRuntime) =>
  codexOf(runtime).feed.builder.items.filter(
    (item) => item.kind === 'notice' && item.code === 'fast',
  )

describe('быстрый режим Codex', () => {
  it('без просьбы уровень не едет, а включённый в конфиге Codex виден как «из настроек»', async () => {
    const runtime = makeRuntime({ CONFIG_TIER: 'priority', FAST_OK: '1' })

    await turn(runtime, 'hi', 1)
    expect(await json('start.json')).not.toHaveProperty('serviceTier')
    expect((await json<object[]>('turns.json'))[0]).not.toHaveProperty('serviceTier')
    expect(shown(runtime)).toEqual({ kind: 'on', fromSettings: true })

    // Выключить режим из конфига - просьба «выключить» для этого разговора.
    runtime.setOptions({ fastMode: false })
    await turn(runtime, 'again', 2)
    expect((await json<object[]>('turns.json'))[1]).toMatchObject({ serviceTier: 'default' })
    expect(shown(runtime)).toEqual({ kind: 'off' })
    await runtime.dispose()
  })

  it('просьба едет с открытием потока и каждым ходом; Codex сказал priority - работает', async () => {
    const runtime = makeRuntime({ FAST_OK: '1' })

    runtime.setOptions({ fastMode: true })
    expect(shown(runtime)).toEqual({ kind: 'waiting' })

    await turn(runtime, 'hi', 1)
    expect(await json('start.json')).toMatchObject({ serviceTier: 'priority' })
    expect((await json<object[]>('turns.json'))[0]).toMatchObject({ serviceTier: 'priority' })
    expect(shown(runtime)).toEqual({ kind: 'on' })
    expect(fastNotices(runtime)).toHaveLength(0)
    await runtime.dispose()
  })

  it('Codex выбросил уровень - «не включился» строкой FAST, один раз на причину', async () => {
    const runtime = makeRuntime({ FAST_OK: '0' })

    await turn(runtime, 'hi', 1)
    runtime.setOptions({ fastMode: true })
    await turn(runtime, 'faster', 2)
    expect(shown(runtime)).toEqual({ kind: 'unavailable', reason: 'not_served' })

    await turn(runtime, 'still', 3)
    expect(fastNotices(runtime)).toHaveLength(1)
    expect(fastNotices(runtime)[0]).toMatchObject({ detail: 'not_served' })
    await runtime.dispose()
  })

  it('модель без быстрого уровня по каталогу снимает просьбу панели', () => {
    const runtime = makeRuntime({ FAST_OK: '1' })

    runtime.setOptions({ fastMode: true })
    runtime.setOptions({ model: 'gpt-slow' })
    expect(runtime.meta.fastMode).toBe(false)

    runtime.setOptions({ model: 'gpt-fast' })
    expect(runtime.meta.fastMode).toBe(false)
  })

  it('ответ: рано судить, пока просьба не уехала; у модели нет уровня - так и сказано', () => {
    const base = { asked: true, sent: undefined, tier: null, modelFast: true }

    expect(fastReportOf(base)).toEqual({ state: 'off', reason: 'pending' })
    expect(fastReportOf({ ...base, sent: true, modelFast: false })).toEqual({
      state: 'off',
      reason: 'model_not_allowed',
    })
    expect(fastReportOf({ ...base, sent: true, tier: 'flex' })).toEqual({
      state: 'off',
      reason: 'not_served',
    })
    expect(fastReportOf({ ...base, asked: undefined, tier: 'priority', modelFast: false })).toEqual(
      { state: 'off', reason: '' },
    )
  })
})

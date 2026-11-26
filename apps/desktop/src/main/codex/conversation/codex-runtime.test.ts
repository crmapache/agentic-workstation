import { rm, chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { PermissionMode } from '@shared/conversation'
import type { FeedPatch } from '@shared/conversation-feed'

import { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { freshConversation } from '../../agents/panel/panel-state'
import type { CodexHost } from './codex-conversation'
import { codexOf } from './codex-conversation'
import { codexDriver } from './codex-driver'
import { rewindCodex } from './codex-rewind'

/**
 * Поддельный `codex app-server`: поток t1, настройки с моделью gpt-cfg; параметры хода -
 * в turn.json рядом. На «approve» в тексте ход спрашивает разрешение на команду и ждёт
 * ответа; на «make a plan» предлагает план и кончает ход; иначе сразу отвечает и выполняет
 * команду.
 */
const FAKE_SERVER = `#!/usr/bin/env node
const readline = require('node:readline')
const out = (value) => process.stdout.write(JSON.stringify(value) + '\\n')
let turns = 0
const turn = (status) => ({ id: 'turn-' + turns, status, items: [] })
const finish = () => {
  out({ method: 'item/completed', params: { threadId: 't1', turnId: 'turn-1', item: { type: 'commandExecution', id: 'c1', command: 'ls', status: 'completed', exitCode: 0, aggregatedOutput: 'a.ts' } } })
  out({ method: 'item/completed', params: { threadId: 't1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'm1', text: 'Done.' } } })
  out({ method: 'thread/tokenUsage/updated', params: { threadId: 't1', turnId: 'turn-1', tokenUsage: { last: { totalTokens: 1200 }, modelContextWindow: 200000 } } })
  out({ method: 'turn/completed', params: { threadId: 't1', turn: turn('completed') } })
}
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') return out({ id: message.id, result: {} })
  if (message.method === 'thread/start') return out({ id: message.id, result: { thread: { id: 't1' } } })
  if (message.method === 'config/read') return out({ id: message.id, result: { config: { model: 'gpt-cfg', model_reasoning_effort: 'low' } } })
  if (message.method === 'turn/start') {
    turns += 1
    require('node:fs').writeFileSync(__dirname + '/turn.json', JSON.stringify(message.params))
    out({ id: message.id, result: { turn: turn('inProgress') } })
    out({ method: 'turn/started', params: { threadId: 't1', turn: turn('inProgress') } })
    out({ method: 'item/agentMessage/delta', params: { threadId: 't1', turnId: 'turn-1', itemId: 'm1', delta: 'Do' } })
    if (message.params.input[0].text.includes('make a plan')) {
      out({ method: 'item/completed', params: { threadId: 't1', turnId: 'turn-1', item: { type: 'plan', id: 'p1', text: '1. Add subtract' } } })
      return out({ method: 'turn/completed', params: { threadId: 't1', turn: turn('completed') } })
    }
    if (message.params.input[0].text.includes('approve')) {
      return out({ id: 'ask-1', method: 'item/commandExecution/requestApproval', params: { threadId: 't1', turnId: 'turn-1', itemId: 'c1', command: 'ls' } })
    }
    return finish()
  }
  if (message.id === 'ask-1') return finish()
  // Прочие запросы (навыки, ...) - пустым ответом, как Codex без навыков.
  if (message.method && message.id !== undefined) return out({ id: message.id, result: {} })
}).on('close', () => process.exit(0))
`

let dir = ''
let binary = ''
let patches: FeedPatch[] = []

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'codex-runtime-'))
  binary = join(dir, 'codex')
  patches = []
  await writeFile(binary, FAKE_SERVER)
  await chmod(binary, 0o755)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** Текст последнего хода, который получил поддельный сервер. */
const lastTurnText = async (): Promise<string> => {
  const params = JSON.parse(await readFile(join(dir, 'turn.json'), 'utf8')) as {
    input: { text?: string }[]
  }

  return params.input[0]?.text ?? ''
}

const makeRuntime = (permissionMode: PermissionMode = 'default') => {
  const host: CodexHost = {
    driver: codexDriver(() => host),
    cli: () =>
      Promise.resolve({ binary, env: process.env as Record<string, string>, version: '0.163.0' }),
    onFeedPatch: (patch) => patches.push(patch),
    version: () => '0.0.0',
    model: () => null,
    turns: () => Promise.resolve({ turns: [], nextCursor: null }),
    onUsageChanged: () => undefined,
    connectors: () => null,
    userMcpServers: () => Promise.resolve([]),
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

describe('разговор Codex на ядре', () => {
  it('ход: новый поток, ответ кусками, команда, конец хода, окно контекста', async () => {
    const runtime = makeRuntime()

    await runtime.send({ text: 'list files', images: [] })
    await expect.poll(() => runtime.meta.status).toBe('idle')
    await expect.poll(() => runtime.meta.outcome).toBe('done')

    const items = codexOf(runtime).feed.builder.items

    expect(runtime.meta.sessionId).toBe('t1')
    expect(runtime.meta.title).toBe('list files')
    expect(items.map((item) => item.kind)).toEqual(['user', 'assistant', 'tool', 'turn'])
    expect(items[1]).toMatchObject({ text: 'Done.', streaming: false })
    expect(items[2]).toMatchObject({ action: { kind: 'command', command: 'ls' }, status: 'done' })
    expect(runtime.meta.usage).toEqual({ contextTokens: 1200, contextWindow: 200000 })
    // «По умолчанию» вкладки - явной моделью и уровнем из настроек Codex.
    expect(JSON.parse(await readFile(join(dir, 'turn.json'), 'utf8'))).toMatchObject({
      model: 'gpt-cfg',
      effort: 'low',
    })
    await runtime.dispose()
  })

  it('вопрос разрешения ждёт человека, ответ отпускает ход', async () => {
    const runtime = makeRuntime()

    await runtime.send({ text: 'approve ls', images: [] })
    await expect.poll(() => runtime.meta.status).toBe('waiting')
    expect(runtime.meta.pending).toMatchObject({
      kind: 'permission',
      action: { kind: 'command', command: 'ls' },
    })

    runtime.respond(runtime.meta.pending?.requestId ?? '', {
      kind: 'permission',
      decision: { behavior: 'allow' },
    })
    await expect.poll(() => runtime.meta.outcome).toBe('done')
    expect(runtime.meta.status).toBe('idle')
    await runtime.dispose()
  })

  it('ход режима плана кончается вопросом о плане; одобрение - «Авто» и «Implement the plan.»', async () => {
    const runtime = makeRuntime('plan')

    await runtime.send({ text: 'make a plan', images: [] })
    await expect.poll(() => runtime.meta.status).toBe('waiting')
    expect(runtime.meta.pending).toMatchObject({
      kind: 'plan',
      toolUseId: 'p1',
      plan: '1. Add subtract',
    })

    runtime.respond(runtime.meta.pending?.requestId ?? '', {
      kind: 'plan',
      approved: true,
      acceptEdits: true,
      feedback: '',
    })
    expect(runtime.meta.permissionMode).toBe('acceptEdits')
    await expect.poll(() => runtime.meta.outcome).toBe('done')
    await expect.poll(lastTurnText).toBe('Implement the plan.')
    // Из плана - явно: Codex держит режим совместной работы на следующие ходы.
    expect(JSON.parse(await readFile(join(dir, 'turn.json'), 'utf8'))).toMatchObject({
      collaborationMode: { mode: 'default' },
    })
    await runtime.dispose()
  })

  it('Stop при плане после хода снимает вопрос: вкладка свободна', async () => {
    const runtime = makeRuntime('plan')

    await runtime.send({ text: 'make a plan', images: [] })
    await expect.poll(() => runtime.meta.status).toBe('waiting')

    runtime.interrupt()
    expect(runtime.meta.status).toBe('idle')
    expect(runtime.meta.pending).toBeNull()
    expect(runtime.meta.stopRequestedAt).toBeNull()
    await runtime.dispose()
  })

  it('откат к сообщению: ход уходит из журнала потока и из ленты, текст - обратно в поле', async () => {
    const runtime = makeRuntime()
    const reverted: string[] = []

    await runtime.send({ text: 'first', images: [] })
    await expect.poll(() => runtime.meta.outcome).toBe('done')
    await runtime.send({ text: 'second', images: [] })
    await expect
      .poll(() => codexOf(runtime).feed.builder.items.filter((item) => item.kind === 'turn').length)
      .toBe(2)

    const second = codexOf(runtime).feed.builder.items.filter((item) => item.kind === 'user')[1]
    const outcome = await rewindCodex(
      runtime,
      second?.id ?? '',
      'conversation',
      (threadId, turnId) => {
        reverted.push(`${threadId}/${turnId}`)

        return Promise.resolve(true)
      },
    )

    expect(outcome).toEqual({ rewound: true, prefill: 'second', filesFailed: null })
    expect(reverted).toEqual(['t1/turn-2'])
    expect(
      codexOf(runtime)
        .feed.builder.items.filter((item) => item.kind === 'user')
        .map((item) => item.kind === 'user' && item.text),
    ).toEqual(['first'])
    expect(codexOf(runtime).feed.builder.items.at(-1)).toMatchObject({
      kind: 'notice',
      code: 'rewound',
    })
    await runtime.dispose()
  })
})

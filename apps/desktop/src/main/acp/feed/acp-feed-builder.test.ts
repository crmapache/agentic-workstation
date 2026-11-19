import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import type { AcpSessionUpdate } from '../protocol/acp-types'
import { AcpFeedBuilder } from './acp-feed-builder'

type Row = { from: 'client' | 'agent' | 'probe'; message: unknown }

const rows = (name: string): Row[] =>
  readFileSync(join(__dirname, '..', '__fixtures__', name), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Row)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Живой поток записи до перезапуска пробника: обновления, сообщения и концы ходов. */
const replayLive = (name: string, builder: AcpFeedBuilder) => {
  let turn = 0

  for (const row of rows(name)) {
    const { message } = row

    if (row.from === 'probe' && message === 'restarted') break
    if (!isRecord(message)) continue

    if (row.from === 'client' && message['method'] === 'session/prompt') {
      const params = message['params'] as { prompt: { text: string }[] }

      turn += 1
      builder.addUserMessage(`u${turn}`, params.prompt[0]?.text ?? '', [], false)
      builder.turnStarted()
    }

    if (message['method'] === 'session/update') {
      builder.update((message['params'] as { update: AcpSessionUpdate }).update)
    }

    const result = message['result']

    if (row.from === 'agent' && isRecord(result) && typeof result['stopReason'] === 'string') {
      builder.turnCompleted({ stopReason: result['stopReason'], error: '' })
    }
  }
}

describe('лента ACP по живой записи', () => {
  it('agy: ответ, чтение, правка с диффом, команда с выводом, отказ, MCP, артефакт', () => {
    const builder = new AcpFeedBuilder()

    replayLive('agy-session.ndjson', builder)

    const tools = builder.items.filter((item) => item.kind === 'tool')
    const edit = tools.find((tool) => tool.action.kind === 'edit')
    const command = tools.find((tool) => tool.action.kind === 'command')

    expect(builder.items.find((item) => item.kind === 'assistant')).toMatchObject({ text: 'OK' })
    expect(tools.find((tool) => tool.action.kind === 'read')?.action).toMatchObject({
      path: '/Users/dev/project/README.md',
    })
    expect(edit?.action).toMatchObject({ kind: 'edit', path: '/Users/dev/project/notes.txt' })
    expect(edit?.result?.changeCounts).toEqual({ added: 1, removed: 1 })
    expect(command?.action).toMatchObject({ command: 'ls -1' })
    expect(command?.result?.text).toContain('README.md')
    expect(tools.some((tool) => tool.status === 'error' && tool.name === 'write_file')).toBe(true)
    expect(tools.some((tool) => tool.name === 'mcp_probe_probe_echo')).toBe(true)
    // Отменённый ход - прерванным, без висящих вызовов.
    expect(tools.every((tool) => tool.status !== 'running')).toBe(true)
    expect(builder.items.filter((item) => item.kind === 'turn').length).toBe(9)
  })

  it('kimi: размышление и ответ кусками, правка с диффом из «in_progress», план', () => {
    const builder = new AcpFeedBuilder(undefined, undefined, undefined, (id) =>
      id.slice(id.indexOf(':') + 1),
    )

    replayLive('kimi-session.ndjson', builder)

    const thinking = builder.items.filter((item) => item.kind === 'thinking')
    const edit = builder.items.find((item) => item.kind === 'tool' && item.action.kind === 'edit')

    expect(thinking.length).toBeGreaterThan(0)
    expect(thinking.every((item) => item.kind === 'thinking' && !item.streaming)).toBe(true)
    expect(edit).toMatchObject({ status: 'done', id: 'call_touq7305' })
    expect(edit?.kind === 'tool' && edit.result?.changeCounts).toEqual({ added: 1, removed: 1 })
  })
})

describe('повтор истории ACP', () => {
  it('session/load: сообщения человека, ходы и вызовы в конечном статусе', () => {
    const builder = new AcpFeedBuilder(undefined, undefined, undefined, undefined, 'p1-')
    let after = false

    for (const row of rows('agy-session.ndjson')) {
      if (row.from === 'probe' && row.message === 'restarted') after = true
      if (!after || !isRecord(row.message) || row.message['method'] !== 'session/update') continue

      builder.update((row.message['params'] as { update: AcpSessionUpdate }).update)
    }
    builder.finishReplay()

    const users = builder.items.filter((item) => item.kind === 'user')

    expect(users[0]).toMatchObject({ text: 'Reply with exactly: OK' })
    expect(users.length).toBe(9)
    expect(builder.items.filter((item) => item.kind === 'turn').length).toBe(9)
    expect(builder.items.every((item) => item.id.startsWith('p1-') || item.kind === 'tool')).toBe(
      true,
    )
  })

  it('kimi: служебные вставки агента не становятся словами человека', () => {
    const builder = new AcpFeedBuilder(undefined, undefined, undefined, undefined, 'p1-')
    let after = false
    let prompts = 0

    for (const row of rows('kimi-session.ndjson')) {
      if (row.from === 'probe' && row.message === 'restarted') after = true
      if (!isRecord(row.message)) continue
      // Команда (/compact) в разговор сообщением человека не ложится.
      if (!after && row.from === 'client' && row.message['method'] === 'session/prompt') {
        const params = row.message['params'] as { prompt: { text: string }[] }

        if (!params.prompt[0]?.text.startsWith('/')) prompts += 1
      }
      if (!after || row.message['method'] !== 'session/update') continue

      builder.update((row.message['params'] as { update: AcpSessionUpdate }).update)
    }
    builder.finishReplay()

    const users = builder.items.filter((item) => item.kind === 'user')

    expect(
      users.every((item) => item.kind === 'user' && !item.text.includes('system-reminder')),
    ).toBe(true)
    expect(users.length).toBe(prompts)
  })
})

import { it, expect, describe } from 'vitest'

import { toolItemsOf } from './codex-tools'

const base = { parent: null, startedAt: 10, endedAt: 20 }

describe('элементы Codex - вызовы ленты', () => {
  it('команда: вид command, вывод в stdout, ненулевой код - ошибка, пока идёт - без итога', () => {
    const [done] = toolItemsOf(
      {
        type: 'commandExecution',
        id: 'c1',
        command: 'pnpm test',
        cwd: '/p',
        status: 'completed',
        aggregatedOutput: 'ok',
        exitCode: 0,
      },
      base,
    )
    const [failed] = toolItemsOf(
      { type: 'commandExecution', id: 'c2', command: 'false', status: 'completed', exitCode: 1 },
      base,
    )
    const [running] = toolItemsOf(
      { type: 'commandExecution', id: 'c3', command: 'sleep 9', status: 'inProgress' },
      base,
    )

    expect(done).toMatchObject({
      action: { kind: 'command', command: 'pnpm test' },
      status: 'done',
      result: { text: 'ok', stdout: 'ok', isError: false },
      endedAt: 20,
    })
    expect(failed).toMatchObject({ status: 'error', result: { isError: true } })
    expect(running).toMatchObject({ status: 'running', result: null, endedAt: 0 })
  })

  it('правка: вызов на файл, новый файл - write со строками, правка - edit с кусками и цифрами', () => {
    const tools = toolItemsOf(
      {
        type: 'fileChange',
        id: 'f1',
        status: 'completed',
        changes: [
          { path: '/p/new.ts', kind: { type: 'add' }, diff: 'a\nb\n' },
          { path: '/p/old.ts', kind: { type: 'update' }, diff: '@@ -1 +1 @@\n-x\n+y\n' },
        ],
      },
      base,
    )

    expect(tools.map((item) => item.id)).toEqual(['f1#0', 'f1#1'])
    expect(tools[0]).toMatchObject({
      action: { kind: 'write', path: '/p/new.ts', lines: 2 },
      result: { created: true, changeCounts: { added: 2, removed: 0 } },
    })
    expect(tools[1]).toMatchObject({
      action: { kind: 'edit', path: '/p/old.ts' },
      result: { created: false, changeCounts: { added: 1, removed: 1 } },
    })
  })

  it('MCP, веб, отказ человека', () => {
    const [mcp] = toolItemsOf(
      {
        type: 'mcpToolCall',
        id: 'm1',
        server: 'gmail',
        tool: 'search',
        arguments: { query: 'invoice' },
        status: 'completed',
        result: { content: [{ type: 'text', text: 'found 2' }] },
      },
      base,
    )
    const [web] = toolItemsOf({ type: 'webSearch', id: 'w1', query: 'vitest' }, base)
    const [denied] = toolItemsOf(
      {
        type: 'fileChange',
        id: 'f2',
        status: 'declined',
        changes: [{ path: '/p/a', kind: 'update', diff: '' }],
      },
      base,
    )

    expect(mcp).toMatchObject({
      name: 'mcp__gmail__search',
      action: { kind: 'mcp', server: 'gmail', tool: 'search', target: 'invoice' },
      result: { text: 'found 2' },
    })
    expect(web).toMatchObject({ action: { kind: 'web', target: 'vitest' }, status: 'done' })
    expect(denied).toMatchObject({ status: 'denied', result: null })
  })

  it('не вызов - пусто', () => {
    expect(toolItemsOf({ type: 'agentMessage', id: 'a', text: 'hi' }, base)).toEqual([])
  })
})

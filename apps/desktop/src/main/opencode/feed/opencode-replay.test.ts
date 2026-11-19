import { it, expect, describe } from 'vitest'

import { editorNote } from '../../agents/conversation/editor-note'
import { replayMessages, inheritedPrefix } from './opencode-replay'

/** Сообщения журнала по форме OpenCode 2.3.2 (`GET /api/session/{id}/message`). */
const user = (id: string, text: string, created: number) => ({
  id,
  type: 'user',
  text,
  time: { created },
})

const assistant = (id: string, content: unknown[], created: number) => ({
  id,
  type: 'assistant',
  content,
  time: { created, completed: created + 4000 },
})

const idle = (id: string, created: number, outcome = 'succeeded', error?: unknown) => ({
  id,
  type: 'idle',
  time: { created },
  outcome,
  ...(error !== undefined && { error }),
})

const replay = (messages: Record<string, unknown>[], latest = true) =>
  replayMessages(
    messages,
    'p1-',
    () => '',
    () => ({ servers: [], root: '/p' }),
    null,
    latest,
  ).items

const readCall = {
  type: 'tool',
  id: 'call_1',
  name: 'read',
  state: {
    status: 'completed',
    input: { path: 'src/a.ts', offset: 1 },
    content: [{ type: 'text', text: '1: x' }],
    metadata: { truncated: false },
  },
  time: { created: 1 },
}

describe('журнал OpenCode в ленте', () => {
  it('ход: сообщение с заметкой о редакторе, размышление, вызов, ответ, строка хода', () => {
    const note = editorNote({ path: '/p/a.ts', name: 'a.ts', from: 2, to: 3, text: 'x' })
    const { items } = replayMessages(
      [
        user('msg_u', `fix it\n\n${note}`, 1000),
        assistant(
          'msg_a',
          [{ type: 'reasoning', text: 'Need to read.' }, readCall, { type: 'text', text: 'Done.' }],
          2000,
        ),
        idle('msg_i', 7000),
      ],
      'p1-',
      () => '',
      () => ({ servers: [], root: '/p' }),
    )

    expect(items.map((item) => item.kind)).toEqual([
      'user',
      'thinking',
      'tool',
      'assistant',
      'turn',
    ])
    expect(items[0]).toMatchObject({
      id: 'msg_u',
      text: 'fix it',
      time: 1000,
      editor: { path: '/p/a.ts', from: 2, to: 3 },
    })
    expect(items[2]).toMatchObject({
      action: { kind: 'read', path: '/p/src/a.ts' },
      status: 'done',
    })
    expect(items[4]).toMatchObject({ id: 'p1-turn-1', interrupted: false, isError: false })
  })

  it('Code Mode: каждый вызов коннектора из кода - своей строкой, как в живой ленте', () => {
    const code = {
      type: 'tool',
      id: 'call_x',
      name: 'execute',
      state: {
        status: 'completed',
        input: { code: 'return Promise.allSettled([...])' },
        content: [{ type: 'text', text: '["ok","fail"]' }],
        metadata: {
          toolCalls: [
            { tool: 'search', status: 'completed', input: { query: 'mail' } },
            { tool: 'gmail.get_thread', status: 'completed', input: { id: 't1' } },
            { tool: 'gmail.get_thread', status: 'error', input: { id: 't2' } },
          ],
        },
      },
      time: { created: 1 },
    }
    const { items } = replayMessages(
      [user('msg_u', 'go', 1000), assistant('msg_a', [code], 2000), idle('msg_i', 3000)],
      'p1-',
      () => '',
      () => ({ servers: ['gmail'], root: '/p' }),
    )
    const tools = items.filter((item) => item.kind === 'tool')

    expect(tools).toMatchObject([
      {
        id: 'call_x',
        action: { kind: 'mcp', server: 'gmail', tool: 'get_thread', target: '{"id":"t1"}' },
        status: 'done',
        result: { text: '["ok","fail"]' },
      },
      {
        id: 'call_x#1',
        input: { id: 't2' },
        action: { kind: 'mcp', server: 'gmail', tool: 'get_thread', target: '{"id":"t2"}' },
        status: 'error',
      },
    ])
  })

  it('ход без отметки конца (IDE закрылась посреди хода) - прерванный', () => {
    const { items } = replayMessages(
      [user('msg_u', 'go', 1000), assistant('msg_a', [readCall], 2000)],
      'p1-',
      () => '',
      () => ({ servers: [], root: '/p' }),
    )

    expect(items.at(-1)).toMatchObject({ kind: 'turn', interrupted: true })
  })

  it('форк: после унаследованных сообщений - строка «ответвлено от»', () => {
    const inherited = inheritedPrefix('msg_1f09bdd0e0014DTo8IPPH7CAyT_4')
    const { items } = replayMessages(
      [
        user('msg_1f09bdd0e0014DTo8IPPH7CAyT_4', 'old', 1000),
        idle('msg_1f09bdd0e0014DTo8IPPH7CAyT_7', 2000),
        user('msg_new', 'new', 3000),
      ],
      'p1-',
      () => '',
      () => ({ servers: [], root: '/p' }),
      { inherited, title: 'Source', sourceSessionId: 'ses_src' },
    )

    expect(inherited).toBe('msg_1f09bdd0e0014DTo8IPPH7CAyT')
    expect(items.map((item) => item.kind)).toEqual(['user', 'turn', 'notice', 'user', 'turn'])
    expect(items[2]).toMatchObject({ code: 'forked', detail: 'Source' })
  })

  it('исход хода - из отметки конца: прерванный - без ошибки, сбой - с причиной', () => {
    const stopped = replay([
      user('msg_u', 'go', 1000),
      idle('msg_i', 2000, 'interrupted', { type: 'Aborted', message: 'aborted' }),
    ])
    const failed = replay([
      user('msg_u', 'go', 1000),
      idle('msg_i', 2000, 'failed', { type: 'Provider', message: 'no credits' }),
    ])

    expect(stopped.map((item) => item.kind)).toEqual(['user', 'turn'])
    expect(stopped[1]).toMatchObject({ interrupted: true, isError: false })
    expect(failed.map((item) => item.kind)).toEqual(['user', 'notice', 'turn'])
    expect(failed[1]).toMatchObject({ code: 'cli-error', detail: 'no credits' })
    expect(failed[2]).toMatchObject({ isError: true })
  })

  it('сообщение посреди хода - доставка в ход, а не новый ход', () => {
    const items = replay([
      user('msg_u', 'go', 1000),
      assistant('msg_a', [{ type: 'text', text: 'Working.' }], 2000),
      user('msg_s', 'also this', 3000),
      assistant('msg_b', [{ type: 'text', text: 'Done.' }], 4000),
      idle('msg_i', 9000),
    ])

    expect(items.map((item) => item.kind)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'turn',
    ])
    expect(items[2]).toMatchObject({ id: 'msg_s', steering: true })
  })

  it('ранняя страница без конца хода - без ложной строки «прерван»', () => {
    const items = replay([user('msg_u', 'go', 1000), assistant('msg_a', [readCall], 2000)], false)

    expect(items.map((item) => item.kind)).toEqual(['user', 'tool'])
  })

  it('patch на два файла - строкой на файл; ход считает оба; ошибка вызова - её текстом', () => {
    const patchCall = {
      type: 'tool',
      id: 'call_p',
      name: 'apply_patch',
      state: {
        status: 'completed',
        input: { patchText: '*** Begin Patch\n*** Update File: a.ts\n*** Add File: b.ts\n' },
        metadata: {
          files: [
            { file: 'a.ts', status: 'modified', patch: '@@ -1 +1 @@\n-x\n+y\n' },
            { file: 'b.ts', status: 'added', patch: '@@ -0,0 +1,2 @@\n+1\n+2\n' },
          ],
        },
      },
    }
    const failedCall = {
      type: 'tool',
      id: 'call_f',
      name: 'shell',
      state: {
        status: 'error',
        input: { command: 'false' },
        error: { type: 'Tool', message: 'exit 1' },
      },
    }
    const items = replay([
      user('msg_u', 'go', 1000),
      assistant('msg_a', [patchCall, failedCall], 2000),
      idle('msg_i', 9000),
    ])

    expect(items.map((item) => item.kind)).toEqual(['user', 'tool', 'tool', 'tool', 'turn'])
    expect(items[1]).toMatchObject({
      action: { kind: 'edit', path: '/p/a.ts' },
      result: { changeCounts: { added: 1, removed: 1 } },
    })
    expect(items[2]).toMatchObject({
      id: 'call_p#1',
      action: { kind: 'write', path: '/p/b.ts' },
      result: { changeCounts: { added: 2, removed: 0 }, created: true },
    })
    expect(items[3]).toMatchObject({ status: 'error', result: { text: 'exit 1' } })
    expect(items[4]).toMatchObject({
      changes: [
        { path: '/p/a.ts', added: 1, removed: 1 },
        { path: '/p/b.ts', added: 2, created: true },
      ],
    })
  })

  it('сжатие из журнала - карточкой, не вышедшее - строкой ошибки', () => {
    const items = replay([
      {
        id: 'msg_c1',
        type: 'compaction',
        status: 'completed',
        reason: 'manual',
        time: { created: 1 },
      },
      {
        id: 'msg_c2',
        type: 'compaction',
        status: 'failed',
        reason: 'auto',
        error: { type: 'X', message: 'too big' },
        time: { created: 2 },
      },
    ])

    expect(items.map((item) => item.kind)).toEqual(['compact', 'notice'])
    expect(items[0]).toMatchObject({ pending: false, trigger: 'manual' })
    expect(items[1]).toMatchObject({ detail: 'too big' })
  })
})

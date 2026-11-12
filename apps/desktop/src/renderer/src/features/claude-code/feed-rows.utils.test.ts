import { it, expect, describe } from 'vitest'

import type { FeedItem, ToolFeedItem } from '@shared/claude-feed'

import { formatTokens, relativePath, touchesFiles, formatDuration } from './claude.utils'
import { diffStats, rowsFromPatch, patchFromInput } from './diff.utils'
import { sameRow, buildFeedRows } from './feed-rows.utils'

const tool = (id: string, name: string, parent: string | null = null): ToolFeedItem => ({
  kind: 'tool',
  id,
  parentToolUseId: parent,
  name,
  input: {},
  status: 'done',
  result: null,
  startedAt: 0,
  endedAt: 0,
  closedReason: null,
})

const text = (id: string): FeedItem => ({
  kind: 'assistant',
  id,
  parentToolUseId: null,
  text: 'hi',
  streaming: false,
})

const thought = (id: string, text = ''): FeedItem => ({
  kind: 'thinking',
  id,
  parentToolUseId: null,
  text,
  streaming: false,
  tokens: 120,
})

describe('строки ленты', () => {
  it('подряд идущие вызовы - одна группа, текст её разрывает', () => {
    const rows = buildFeedRows([tool('a', 'Read'), tool('b', 'Grep'), text('t'), tool('c', 'Bash')])

    expect(rows.map((row) => row.kind)).toEqual(['tools', 'assistant', 'tools'])
    expect(rows[0]?.kind === 'tools' && rows[0].items.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('правка - своя карточка, список задач и поиск инструментов не рисуются', () => {
    const rows = buildFeedRows([
      tool('a', 'Read'),
      tool('b', 'TaskUpdate'),
      tool('c', 'Edit'),
      tool('d', 'ToolSearch'),
    ])

    expect(rows.map((row) => row.kind)).toEqual(['tools', 'edit'])
  })

  it('мысли между вызовами - одна карточка THINK, вызовы - одна группа, скрытые мысли не рисуются', () => {
    const rows = buildFeedRows([
      thought('t1', 'look at the file'),
      tool('a', 'Read'),
      thought('t2', 'one more'),
      thought('quiet'),
      tool('b', 'Bash'),
    ])

    expect(rows.map((row) => row.kind)).toEqual(['think', 'tools'])
    expect(rows[0]?.kind === 'think' && rows[0].items.map((item) => item.id)).toEqual(['t1', 't2'])
    expect(rows[1]?.kind === 'tools' && rows[1].items.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('Write идёт в группе, правка рвёт её; вопрос без ответа в ленте не стоит', () => {
    const asked = { ...tool('q', 'AskUserQuestion'), status: 'running' } as FeedItem
    const rows = buildFeedRows([tool('a', 'Write'), tool('b', 'Edit'), tool('c', 'Read'), asked])

    expect(rows.map((row) => row.kind)).toEqual(['tools', 'edit', 'tools'])
  })

  it('работа субагента лежит внутри его карточки', () => {
    const rows = buildFeedRows([tool('agent', 'Task'), tool('x', 'Read', 'agent'), text('t')])

    expect(rows.map((row) => row.kind)).toEqual(['agent', 'assistant'])
    expect(rows[0]?.kind === 'agent' && rows[0].children.map((item) => item.id)).toEqual(['x'])
  })
})

describe('та же строка', () => {
  it('нетронутые элементы - та же строка, тронутый - другая', () => {
    const items = [tool('a', 'Read'), tool('b', 'Grep'), text('t')]
    const before = buildFeedRows(items)
    const same = buildFeedRows([...items])
    const changed = buildFeedRows([
      items[0],
      { ...tool('b', 'Grep'), status: 'done' },
      items[2],
    ] as FeedItem[])

    expect(before.every((row, index) => same[index] && sameRow(row, same[index]))).toBe(true)
    expect(before[0] && changed[0] && sameRow(before[0], changed[0])).toBe(false)
    expect(before[1] && changed[1] && sameRow(before[1], changed[1])).toBe(true)
  })
})

describe('патч, после которого дерево перечитывается', () => {
  it('откат, итог хода и отработавшая команда - да, текст ответа - нет', () => {
    const shell = (status: 'running' | 'done') =>
      ({
        kind: 'shell',
        id: 's',
        parentToolUseId: null,
        command: 'ls',
        status,
        stdout: '',
        stderr: '',
        exitCode: null,
        truncated: false,
      }) as const

    expect(touchesFiles({ conversationId: 'c', upserts: [text('a')] })).toBe(false)
    expect(touchesFiles({ conversationId: 'c', upserts: [shell('running')] })).toBe(false)
    expect(touchesFiles({ conversationId: 'c', upserts: [shell('done')] })).toBe(true)
    expect(touchesFiles({ conversationId: 'c', upserts: [], removes: ['u1'] })).toBe(true)
  })
})

describe('подписи', () => {
  it('время, токены и пути', () => {
    expect(formatDuration(400)).toBe('0.4s')
    expect(formatDuration(65_000)).toBe('1m 05s')
    expect(formatDuration(59_600)).toBe('1m 00s')
    expect(formatDuration(3_725_000)).toBe('1h 02m 05s')
    expect(formatDuration(-200)).toBe('0.0s')
    expect(formatTokens(12_400)).toBe('12k')
    expect(formatTokens(950)).toBe('950')
    expect(relativePath('/p/src/a.ts', '/p')).toBe('src/a.ts')
    expect(relativePath('/other/a.ts', '/p')).toBe('/other/a.ts')
  })
})

describe('дифф правки', () => {
  it('из входа Edit - удалённое и добавленное с контекстом', () => {
    const rows = rowsFromPatch(
      patchFromInput('Edit', { old_string: 'a\nb\nc', new_string: 'a\nB\nc' }),
      false,
    )

    expect(rows.map((row) => `${row.kind}:${row.text}`)).toEqual([
      'ctx:a',
      'del:b',
      'add:B',
      'ctx:c',
    ])
    expect(diffStats(rows)).toEqual({ added: 1, removed: 1 })
  })

  it('из патча CLI - номера строк файла', () => {
    const rows = rowsFromPatch(
      [{ oldStart: 10, oldLines: 2, newStart: 10, newLines: 2, lines: [' x', '-y', '+z'] }],
      true,
    )

    expect(rows.map((row) => row.line)).toEqual([10, 11, 11])
  })
})

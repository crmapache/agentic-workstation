import { it, expect, describe } from 'vitest'

import type { FeedItem, ToolFeedItem } from '@shared/conversation-feed'

import { claudeToolAction } from '../feed/tool-action'
import { turnTools, turnChanges } from './turn-changes'
import type { EditEntry } from './turn-edits'

const edit = (
  id: string,
  name: string,
  input: Record<string, unknown>,
  result: Partial<NonNullable<ToolFeedItem['result']>> | null,
  parent: string | null = null,
): ToolFeedItem => ({
  kind: 'tool',
  id,
  parentToolUseId: parent,
  name,
  input,
  action: claudeToolAction(name, input),
  status: 'done',
  result: result && { text: '', isError: false, truncated: false, ...result },
  startedAt: 0,
  endedAt: 0,
  closedReason: null,
})

const row = (path: string, fields: Record<string, unknown>) => ({
  path,
  created: false,
  counted: true,
  undoable: true,
  reverted: false,
  refusal: null,
  ...fields,
})

const PATCH: EditEntry['edit'] = {
  kind: 'patch',
  hunks: [{ oldStart: 1, newStart: 1, lines: ['-a', '+b'] }],
}

describe('файлы хода', () => {
  it('сумма по файлу, созданный - по аргументу, субагенты тоже, чтение - мимо', () => {
    const changes = turnChanges([
      edit('1', 'Write', { file_path: '/p/new.ts', content: 'a\nb\nc\n' }, { created: true }),
      edit('2', 'Edit', { file_path: '/p/new.ts' }, { changeCounts: { added: 1, removed: 1 } }),
      edit(
        '3',
        'Edit',
        { file_path: '/p/old.ts' },
        { changeCounts: { added: 8000, removed: 8000 } },
        'agent',
      ),
      edit('5', 'Read', { file_path: '/p/read.ts' }, {}),
    ])

    expect(changes).toEqual([
      row('/p/new.ts', { added: 4, removed: 1, created: true }),
      row('/p/old.ts', { added: 8000, removed: 8000 }),
    ])
  })

  // Большую правку CLI присылает с пустым structuredPatch, лента помечает её `uncounted` -
  // файл раньше выпадал из списка.
  it('большая правка с пустым диффом остаётся в списке - «±» без кнопки', () => {
    const changes = turnChanges([
      edit(
        '1',
        'Edit',
        { file_path: '/p/big.js', old_string: 'foo(', new_string: 'bar(', replace_all: true },
        { uncounted: true },
      ),
      edit('2', 'Write', { file_path: '/p/over.js', content: 'x' }, { uncounted: true }),
      edit(
        '3',
        'Edit',
        { file_path: '/p/one.js', old_string: 'a', new_string: 'b\nc' },
        { uncounted: true },
      ),
    ])

    expect(changes).toEqual([
      row('/p/big.js', { added: 0, removed: 0, counted: false, undoable: false }),
      row('/p/over.js', { added: 0, removed: 0, counted: false, undoable: false }),
      // Одиночная замена считается по вызову, но точного диффа нет - кнопки нет.
      row('/p/one.js', { added: 2, removed: 1, undoable: false }),
    ])
  })

  // Пустой дифф у Write того же текста лента считает настоящим нулём, а не «±».
  it('запись того же текста строки не даёт и без учёта правок', () => {
    const changes = turnChanges([
      edit(
        '1',
        'Write',
        { file_path: '/p/same.ts', content: 'x' },
        { changeCounts: { added: 0, removed: 0 } },
      ),
    ])

    expect(changes).toEqual([])
  })

  it('с учётом правок: запись того же текста строки не даёт, кнопка - только с правкой', () => {
    const ledger = new Map<string, EditEntry>([
      ['1', { path: '/p/same.ts', edit: 'unchanged' }],
      ['2', { path: '/p/a.ts', edit: PATCH }],
    ])
    const changes = turnChanges(
      [
        edit(
          '1',
          'Write',
          { file_path: '/p/same.ts', content: 'x' },
          { changeCounts: { added: 0, removed: 0 } },
        ),
        edit('2', 'Edit', { file_path: '/p/a.ts' }, { changeCounts: { added: 1, removed: 1 } }),
        edit('3', 'Edit', { file_path: '/p/b.ts' }, { changeCounts: { added: 1, removed: 0 } }),
      ],
      ledger,
    )

    expect(changes).toEqual([
      row('/p/a.ts', { added: 1, removed: 1 }),
      row('/p/b.ts', { added: 1, removed: 0, undoable: false }),
    ])
  })

  it('без структурной половины - по вызову и без кнопки; провал и правка ни о чём - мимо', () => {
    const changes = turnChanges([
      edit(
        '1',
        'Write',
        { file_path: '/p/w.ts', content: 'a\nb\n' },
        { text: 'File created successfully at: /p/w.ts' },
      ),
      edit(
        '2',
        'MultiEdit',
        { file_path: '/p/m.ts', edits: [{ old_string: 'a', new_string: 'b' }] },
        {},
      ),
      edit(
        '3',
        'Edit',
        { file_path: '/p/e.ts', old_string: 'a', new_string: 'b' },
        { isError: true },
      ),
      edit(
        '4',
        'Edit',
        { file_path: '/p/r.ts', old_string: 'a', new_string: 'b', replace_all: true },
        {},
      ),
    ])

    expect(changes).toEqual([
      row('/p/w.ts', { added: 2, removed: 0, created: true, undoable: false }),
      row('/p/m.ts', { added: 1, removed: 1, undoable: false }),
      row('/p/r.ts', { added: 0, removed: 0, counted: false, undoable: false }),
    ])
  })
})

describe('вызовы хода', () => {
  it('от итога назад до прошлого итога или сообщения, начавшего ход', () => {
    const user = (id: string, steering: boolean): FeedItem => ({
      kind: 'user',
      id,
      parentToolUseId: null,
      text: '',
      time: 0,
      images: [],
      steering,
    })
    const turn = (id: string): FeedItem => ({
      kind: 'turn',
      id,
      parentToolUseId: null,
      durationMs: 0,
      costUsd: 0,
      isError: false,
      interrupted: false,
      changes: [],
      revertable: false,
    })
    const items: FeedItem[] = [
      edit('old', 'Edit', {}, null),
      turn('t1'),
      edit('aborted', 'Edit', {}, null),
      user('u1', false),
      edit('a', 'Edit', {}, null),
      user('u2', true),
      edit('b', 'Edit', {}, null, 'agent'),
      turn('t2'),
    ]

    expect(turnTools(items, 't2').map((tool) => tool.id)).toEqual(['a', 'b'])
    expect(turnTools(items, 't1').map((tool) => tool.id)).toEqual(['old'])
    expect(turnTools(items, 'missing')).toEqual([])
  })
})

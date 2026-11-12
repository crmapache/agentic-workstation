import { it, expect, describe } from 'vitest'

import {
  topLevel,
  canRewind,
  shortPath,
  toolLabel,
  editCounts,
  innerSteps,
  runningTask,
  toolSummary,
} from './Feed.utils'

describe('лента телефона: чтение элементов', () => {
  it('шаги субагента прячутся в число на строке его вызова', () => {
    const items = [
      { id: 'agent-1', kind: 'tool', parentToolUseId: null },
      { id: 'x', kind: 'tool', parentToolUseId: 'agent-1' },
      { id: 'y', kind: 'assistant', parentToolUseId: 'agent-1' },
      { id: 'a', kind: 'assistant', parentToolUseId: null },
    ]

    expect(topLevel(items).map((item) => item.id)).toEqual(['agent-1', 'a'])
    expect(innerSteps(items).get('agent-1')).toBe(2)
  })

  it('о чём вызов - по инструменту', () => {
    expect(toolSummary('Bash', { command: 'ls', description: 'List files' })).toBe('List files')
    expect(toolSummary('Bash', { command: 'ls -la' })).toBe('ls -la')
    expect(toolSummary('Edit', { file_path: '/Users/x/Projects/app/src/a.ts' })).toBe('src/a.ts')
    expect(toolSummary('Grep', { pattern: 'TODO' })).toBe('TODO')
    expect(toolSummary('Mystery', { count: 3, what: 'thing' })).toBe('thing')
    expect(toolLabel('mcp__github__create_issue')).toBe('github: create_issue')
    expect(shortPath('/a/b/c.ts')).toBe('b/c.ts')
  })

  it('правка файла итогом +N -M: цифры CLI, иначе по диффу, у нового файла - по строкам', () => {
    expect(editCounts('Edit', {}, { changeCounts: { added: 4, removed: 2 } })).toEqual({
      added: 4,
      removed: 2,
    })
    expect(
      editCounts(
        'MultiEdit',
        {},
        { patch: [{ lines: ['+a', '+b', '-c', ' d'] }, { lines: ['-e'] }] },
      ),
    ).toEqual({ added: 2, removed: 2 })
    expect(editCounts('Write', { content: 'one\ntwo\nthree' }, null)).toEqual({
      added: 3,
      removed: 0,
    })
    expect(editCounts('Bash', {}, null)).toBeNull()
  })

  it('остановить можно только идущую задачу с id, который CLI примет', () => {
    const task = { taskId: 'task_1', kind: 'command', outcome: null }

    expect(runningTask({ task })).toEqual({ taskId: 'task_1', kind: 'command' })
    expect(runningTask({ task: { ...task, outcome: 'completed' } })).toBeNull()
    expect(runningTask({ task: { taskId: 'task_1' } })).toBeNull()
    expect(runningTask({ task: { ...task, taskId: '../x' } })).toBeNull()
    expect(runningTask({})).toBeNull()
  })

  it('откат - к сообщению из транскрипта, начинавшему ход', () => {
    const id = '6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f'

    expect(canRewind({ id, kind: 'user', steering: false })).toBe(true)
    expect(canRewind({ id, kind: 'user', steering: true })).toBe(false)
    expect(canRewind({ id, kind: 'user', auto: 'limit' })).toBe(false)
    expect(canRewind({ id: 'local-1', kind: 'user' })).toBe(false)
    expect(canRewind({ id, kind: 'assistant' })).toBe(false)
  })
})

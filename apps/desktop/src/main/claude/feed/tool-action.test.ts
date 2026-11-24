import { it, expect, describe } from 'vitest'

import { claudeToolAction } from './tool-action'

describe('claudeToolAction', () => {
  it('чтение - путь файла и строка сдвига; без сдвига - null', () => {
    expect(claudeToolAction('Read', { file_path: '/p/a.ts', offset: 40 })).toEqual({
      kind: 'read',
      path: '/p/a.ts',
      line: 40,
    })
    expect(claudeToolAction('NotebookRead', { notebook_path: '/p/n.ipynb' })).toEqual({
      kind: 'read',
      path: '/p/n.ipynb',
      line: null,
    })
  })

  it('поиск - шаблон и папка, а не файл для ссылки', () => {
    expect(claudeToolAction('Grep', { pattern: 'TODO', path: '/p/src' })).toEqual({
      kind: 'search',
      pattern: 'TODO',
      path: '/p/src',
    })
    expect(claudeToolAction('Glob', { pattern: '**/*.ts' })).toMatchObject({
      kind: 'search',
      path: '',
    })
  })

  it('правка - дифф по входу, у MultiEdit - кусок на каждую замену', () => {
    const edit = claudeToolAction('Edit', {
      file_path: '/p/a.ts',
      old_string: 'one',
      new_string: 'two',
    })
    const multi = claudeToolAction('MultiEdit', {
      file_path: '/p/a.ts',
      edits: [
        { old_string: 'a', new_string: 'b' },
        { old_string: 'c', new_string: 'd' },
      ],
    })

    expect(edit).toMatchObject({ kind: 'edit', path: '/p/a.ts' })
    // Строку «\ No newline» дифф кладёт сам, отрисовка её пропускает.
    expect(
      edit.kind === 'edit' && edit.preview[0]?.lines.filter((line) => !line.startsWith('\\')),
    ).toEqual(['-one', '+two'])
    expect(multi.kind === 'edit' && multi.preview).toHaveLength(2)
    expect(claudeToolAction('NotebookEdit', { notebook_path: '/p/n.ipynb' })).toEqual({
      kind: 'edit',
      path: '/p/n.ipynb',
      preview: [],
    })
  })

  it('новый файл - строки содержимого и дифф с первой строки', () => {
    const write = claudeToolAction('Write', { file_path: '/p/new.ts', content: 'a\nb\n' })

    expect(write).toMatchObject({ kind: 'write', path: '/p/new.ts', lines: 2 })
    expect(write.kind === 'write' && write.preview[0]?.lines).toEqual(['+a', '+b'])
  })

  it('команда, сеть, скилл', () => {
    expect(claudeToolAction('Bash', { command: 'pnpm test', description: 'Run tests' })).toEqual({
      kind: 'command',
      command: 'pnpm test',
      description: 'Run tests',
    })
    expect(claudeToolAction('WebFetch', { url: 'https://a.b' })).toEqual({
      kind: 'web',
      target: 'https://a.b',
    })
    expect(claudeToolAction('WebSearch', { query: 'vitest' })).toEqual({
      kind: 'web',
      target: 'vitest',
    })
    expect(claudeToolAction('Skill', { skill: 'adr', args: 'first\nsecond' })).toEqual({
      kind: 'skill',
      skill: 'adr',
      args: 'first',
    })
  })

  it('наблюдатель - команда или адрес сокета, одно из двух', () => {
    expect(
      claudeToolAction('Monitor', { command: 'tail -F app.log', description: 'Watch the log' }),
    ).toEqual({
      kind: 'monitor',
      command: 'tail -F app.log',
      url: '',
      description: 'Watch the log',
    })
    expect(
      claudeToolAction('Monitor', { ws: { url: 'wss://a.b/feed' }, description: 'Watch the feed' }),
    ).toEqual({
      kind: 'monitor',
      command: '',
      url: 'wss://a.b/feed',
      description: 'Watch the feed',
    })
  })

  it('субагент и workflow, план, вопрос', () => {
    expect(
      claudeToolAction('Task', { subagent_type: 'Explore', description: 'Find', prompt: 'Look' }),
    ).toEqual({
      kind: 'agent',
      agent: 'Explore',
      description: 'Find',
      prompt: 'Look',
      workflow: false,
    })
    expect(claudeToolAction('Workflow', {})).toMatchObject({ kind: 'agent', workflow: true })
    expect(claudeToolAction('ExitPlanMode', { plan: '1. Do' })).toEqual({
      kind: 'plan',
      plan: '1. Do',
    })
    expect(
      claudeToolAction('AskUserQuestion', { questions: [{ question: 'Which?' }, { header: 'x' }] }),
    ).toEqual({ kind: 'question', questions: ['Which?'] })
  })

  it('служебные вызовы списка задач - todo, лента их не рисует', () => {
    for (const name of [
      'TodoWrite',
      'TaskCreate',
      'TaskUpdate',
      'TaskGet',
      'TaskList',
      'ToolSearch',
    ]) {
      expect(claudeToolAction(name, {})).toEqual({ kind: 'todo' })
    }
  })

  it('MCP - сервер и инструмент по отдельности, цель из входа', () => {
    expect(claudeToolAction('mcp__gmail-work__search_threads', { query: 'invoice' })).toEqual({
      kind: 'mcp',
      server: 'gmail-work',
      tool: 'search_threads',
      target: 'invoice',
      path: '',
    })
  })

  it('незнакомый вызов - путь или первая строка описания', () => {
    expect(claudeToolAction('Mystery', { path: '/p/dir' })).toEqual({
      kind: 'other',
      target: '',
      path: '/p/dir',
    })
    expect(claudeToolAction('Mystery', { description: 'First\nSecond' })).toEqual({
      kind: 'other',
      target: 'First',
      path: '',
    })
  })
})

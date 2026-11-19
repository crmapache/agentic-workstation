import { it, expect, describe } from 'vitest'

import type { ToolFeedItem } from '@shared/conversation-feed'

import { codeCallsOf, codeModeRows, codeModeCalls, codeModeAction } from './code-mode'

const SERVERS = ['todoist-personal', 'gmail', 'gmail-work', 'notifications']

/** Код и ход вызова `execute` - как их прислал живой OpenCode 2.3.2 на Code Mode. */
const SEARCH_CODE =
  'const res = await search({ query: "todoist", limit: 50 });\nreturn res.items.map(i => i.path)'
const CALL_CODE =
  'const r = await tools["todoist-personal"]["find-tasks"]({ filter: "today", limit: 100 });\nreturn r.tasks'
const searching = {
  toolCalls: [{ tool: 'search', status: 'running', input: { query: 'todoist' } }],
}
const finding = (status: string) => ({
  toolCalls: [
    { tool: 'todoist-personal.find-tasks', status, input: { filter: 'today', limit: 100 } },
  ],
})

const tool = (input: Record<string, unknown>): ToolFeedItem => ({
  kind: 'tool',
  id: 'call_1',
  parentToolUseId: null,
  name: 'execute',
  input,
  action: { kind: 'other', target: '', path: '' },
  status: 'running',
  result: null,
  startedAt: 10,
  endedAt: 0,
  closedReason: null,
})

describe('codeCallsOf', () => {
  it('finds connector calls in any property access form', () => {
    const code = [
      'await tools["todoist-personal"]["find-tasks"]({})',
      "await tools.notifications['notify']({})",
      'await tools[`gmail-work`].search_threads({})',
      'await tools.gmail.get_thread({})',
    ].join('\n')

    expect(codeCallsOf(code, SERVERS)).toEqual([
      { server: 'todoist-personal', tool: 'find-tasks' },
      { server: 'notifications', tool: 'notify' },
      { server: 'gmail-work', tool: 'search_threads' },
      { server: 'gmail', tool: 'get_thread' },
    ])
  })

  it('skips the tool search and unknown namespaces', () => {
    const code =
      'await tools.search({ query: "x" })\nawait tools.other.thing({})\nmytools.gmail.x()'

    expect(codeCallsOf(code, SERVERS)).toEqual([])
  })
})

describe('codeModeCalls', () => {
  it('takes connector calls from toolCalls and leaves search and fetch out', () => {
    const metadata = {
      toolCalls: [
        ...searching.toolCalls,
        { tool: 'fetch', status: 'completed', input: { url: 'https://example.com' } },
        { tool: 'gmail-work.search_threads', status: 'error', input: { q: 'x' } },
      ],
    }

    expect(codeModeCalls(metadata, SERVERS)).toEqual([
      { server: 'gmail-work', tool: 'search_threads', input: { q: 'x' }, status: 'error' },
    ])
  })

  it('reads nothing from a missing or broken metadata', () => {
    expect(codeModeCalls(undefined, SERVERS)).toEqual([])
    expect(codeModeCalls({ toolCalls: 'x' }, SERVERS)).toEqual([])
  })
})

describe('codeModeAction', () => {
  it('hides code that only searches for tools', () => {
    expect(codeModeAction({ code: SEARCH_CODE }, searching, SERVERS)).toEqual({ kind: 'todo' })
  })

  it('names the connector call by the code before it runs, by its input after', () => {
    expect(codeModeAction({ code: CALL_CODE }, null, SERVERS)).toEqual({
      kind: 'mcp',
      server: 'todoist-personal',
      tool: 'find-tasks',
      target: '',
      path: '',
    })
    expect(codeModeAction({ code: CALL_CODE }, finding('running'), SERVERS)).toEqual({
      kind: 'mcp',
      server: 'todoist-personal',
      tool: 'find-tasks',
      target: '{"filter":"today","limit":100}',
      path: '',
    })
  })

  it('shows a fetch as a web request and anything else by its first line', () => {
    expect(
      codeModeAction({ code: 'return await fetch("https://a.dev/x")' }, null, SERVERS),
    ).toEqual({ kind: 'web', target: 'https://a.dev/x' })
    expect(codeModeAction({ code: 'return 1 + 2\n// done' }, null, SERVERS)).toEqual({
      kind: 'other',
      target: 'return 1 + 2',
      path: '',
    })
  })
})

describe('codeModeRows', () => {
  const two = (first: string, second: string) => ({
    toolCalls: [
      { tool: 'gmail.search_threads', status: first, input: { q: 'invoice' } },
      { tool: 'notifications.notify', status: second, input: { title: 'Found' } },
    ],
  })

  it('keeps one row while the code calls no connector', () => {
    const row = tool({ code: SEARCH_CODE })

    expect(codeModeRows(row, searching, SERVERS, 0)).toEqual([row])
  })

  it('gives every further connector call its own row with its own outcome', () => {
    const [main, extra] = codeModeRows(tool({ code: 'x' }), two('completed', 'running'), SERVERS, 0)

    expect(main?.action).toMatchObject({ kind: 'mcp', server: 'gmail', tool: 'search_threads' })
    expect(main?.status).toBe('running')
    expect(extra).toMatchObject({
      id: 'call_1#1',
      input: { title: 'Found' },
      action: { kind: 'mcp', server: 'notifications', tool: 'notify' },
      status: 'running',
      result: null,
      endedAt: 0,
    })
  })

  it('closes calls the finished code left without an answer', () => {
    const [, failed] = codeModeRows(tool({ code: 'x' }), two('completed', 'error'), SERVERS, 99)
    const [, cut] = codeModeRows(tool({ code: 'x' }), two('completed', 'running'), SERVERS, 99)

    expect(failed).toMatchObject({
      status: 'error',
      result: { isError: true },
      endedAt: 99,
      closedReason: null,
    })
    expect(cut).toMatchObject({ status: 'interrupted', closedReason: 'turnEnded', endedAt: 99 })
  })
})

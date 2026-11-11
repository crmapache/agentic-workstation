import { it, expect, describe } from 'vitest'

import { keyOf } from '../stats-keys'
import { FileParser } from './file-parser'
import type { CopyTable, KnownTool, FileContext } from './parsed-rows'
import {
  atMs,
  hunk,
  toolUse,
  assistant,
  attachment,
  toolResult,
  humanPrompt,
} from './__fixtures__/transcript-lines'

const context = (patch: Partial<FileContext> = {}): FileContext => ({
  session: 'S1',
  subagent: false,
  knownTool: () => null,
  isCopy: () => false,
  ...patch,
})

const parse = (lines: Buffer[], patch: Partial<FileContext> = {}) => {
  const parser = new FileParser(context(patch), null)

  for (const line of lines) parser.line(line)

  return parser.take()
}

describe('FileParser answers', () => {
  it('merges the lines of one answer: largest usage, earliest time', () => {
    const answer = { id: 'msg_1', request: 'req_1' }
    const rows = parse([
      assistant({ minute: 1, uuid: 'a1' }, { ...answer, usage: { input: 5, output: 10 } }),
      assistant({ minute: 3, uuid: 'a2' }, { ...answer, usage: { input: 5, output: 50 } }),
      assistant(
        { minute: 4, uuid: 'a3' },
        { id: 'msg_2', request: 'req_2', usage: { input: 1, output: 1 } },
      ),
    ])

    expect(rows.answers).toHaveLength(2)
    expect(rows.answers[0]).toMatchObject({
      input: 5,
      output: 50,
      ts: atMs(1),
      model: 'claude-opus-5-5',
    })
  })

  it('skips the synthetic placeholder and empty usage', () => {
    const rows = parse([
      assistant({ minute: 1, uuid: 'a1' }, { id: 'm', request: 'r', model: '<synthetic>' }),
      assistant({ minute: 2, uuid: 'a2' }, { id: 'm2', request: 'r2' }),
    ])

    expect(rows.answers).toHaveLength(0)
  })
})

describe('FileParser edits', () => {
  const editCall = (id: string, name = 'Edit', input: Record<string, unknown> = {}) =>
    assistant(
      { minute: 1, uuid: `u-${id}` },
      { id: `m-${id}`, request: `r-${id}`, usage: { output: 1 } },
      [toolUse(id, name, { file_path: '/work/app/src/a.ts', ...input })],
    )

  it('counts lines from structuredPatch of a successful edit', () => {
    const rows = parse([
      editCall('t1'),
      toolResult({ minute: 2, uuid: 'r1' }, 't1', {
        filePath: '/work/app/src/a.ts',
        oldString: 'x',
        newString: 'y',
        structuredPatch: [hunk(['+a', '+b', '-c', ' d', '\\ No newline at end of file'])],
      }),
    ])

    expect(rows.edits).toEqual([
      expect.objectContaining({ tool: 'Edit', ext: 'ts', added: 2, removed: 1, ts: atMs(2) }),
    ])
  })

  it('ignores a failed tool result', () => {
    const rows = parse([
      editCall('t1'),
      toolResult(
        { minute: 2, uuid: 'r1' },
        't1',
        { filePath: '/work/app/src/a.ts', structuredPatch: [hunk(['+a'])] },
        { isError: true },
      ),
    ])

    expect(rows.edits).toHaveLength(0)
  })

  it('counts the content of a created file when its patch is empty', () => {
    const rows = parse([
      editCall('t1', 'Write'),
      toolResult({ minute: 2, uuid: 'r1' }, 't1', {
        type: 'create',
        filePath: '/work/app/README.md',
        content: 'one\ntwo\nthree\n',
        structuredPatch: [],
      }),
    ])

    expect(rows.edits).toEqual([
      expect.objectContaining({ tool: 'Write', ext: 'md', added: 3, removed: 0 }),
    ])
  })

  it('falls back to old and new strings without structuredPatch', () => {
    const rows = parse([
      editCall('t1'),
      toolResult({ minute: 2, uuid: 'r1' }, 't1', {
        filePath: '/work/app/src/a.ts',
        oldString: 'same\nold\nsame2',
        newString: 'same\nnew1\nnew2\nsame2',
      }),
    ])

    expect(rows.edits).toEqual([expect.objectContaining({ added: 2, removed: 1 })])
  })

  it('counts files changed by a shell command, but not by git', () => {
    const diff = {
      files: [{ filePath: '/work/app/x.py', hunks: [hunk(['+a', '+b'])] }],
      moreFiles: 0,
    }
    const rows = parse([
      editCall('b1', 'Bash', { command: "python3 - <<'EOF'\nopen('x.py','w')\nEOF" }),
      toolResult({ minute: 2, uuid: 'r1' }, 'b1', { stdout: '', bashEditDiff: diff }),
      editCall('b2', 'Bash', { command: 'git checkout main' }),
      toolResult({ minute: 3, uuid: 'r2' }, 'b2', { stdout: '', bashEditDiff: diff }),
    ])

    expect(rows.edits).toEqual([expect.objectContaining({ tool: 'Bash', ext: 'py', added: 2 })])
  })

  it('uses the call read in an earlier pass when the result arrives later', () => {
    const known: KnownTool = { name: 'Bash', skipEdits: true }
    const rows = parse(
      [
        toolResult({ minute: 2, uuid: 'r1' }, 'b9', {
          stdout: '',
          bashEditDiff: { files: [{ filePath: '/a.json', hunks: [hunk(['+x'])] }], moreFiles: 0 },
        }),
      ],
      { knownTool: (id) => (id === 'b9' ? known : null) },
    )

    expect(rows.edits).toHaveLength(0)
  })
})

describe('FileParser tools, prompts and permissions', () => {
  it('splits MCP tools by server', () => {
    const rows = parse([
      assistant({ minute: 1, uuid: 'a1' }, { id: 'm', request: 'r', usage: { output: 1 } }, [
        toolUse('t1', 'mcp__notion__search'),
        toolUse('t2', 'Read'),
      ]),
    ])

    expect(rows.toolCalls.map((call) => [call.tool, call.server])).toEqual([
      ['mcp__notion__search', 'notion'],
      ['Read', null],
    ])
  })

  it('tells human messages from tool results and automatic turns', () => {
    const rows = parse([
      humanPrompt({ minute: 0, uuid: 'p1' }, 'please fix the bug'),
      toolResult({ minute: 1, uuid: 'r1' }, 'tx', { stdout: 'x' }),
      humanPrompt({ minute: 2, uuid: 'p2' }, 'caveat', { isMeta: true }),
      humanPrompt({ minute: 3, uuid: 'p3' }, '<task-notification>\n<task-id>1</task-id>'),
      humanPrompt({ minute: 4, uuid: 'p4' }, '[Request interrupted by user]'),
      humanPrompt({ minute: 5, uuid: 'p5' }, 'wake', { turnOrigin: 'scheduled' }),
      humanPrompt({ minute: 6, uuid: 'p6' }, '<command-message>review</command-message>'),
    ])

    expect(rows.prompts.map((prompt) => [prompt.key, prompt.human])).toEqual([
      [keyOf('p1'), true],
      [keyOf('p2'), false],
      [keyOf('p3'), false],
      [keyOf('p5'), false],
      [keyOf('p6'), true],
    ])
  })

  it('records only decisions the human made', () => {
    const decision = (source: string, extra = {}) => ({ decision: 'accept', source, ...extra })
    const rows = parse([
      toolResult({ minute: 1, uuid: 'r1' }, 't1', {}, { permission: decision('user_temporary') }),
      toolResult(
        { minute: 2, uuid: 'r2' },
        't2',
        {},
        { permission: { decision: 'reject', source: 'user_reject' } },
      ),
      toolResult(
        { minute: 3, uuid: 'r3' },
        't3',
        {},
        { permission: decision('config', { reasonType: 'mode' }) },
      ),
      toolResult(
        { minute: 4, uuid: 'r4' },
        't4',
        {},
        { permission: decision('user_permanent', { reasonType: 'rule' }) },
      ),
    ])

    expect(rows.permissions.map((row) => row.decision)).toEqual(['allow', 'deny'])
  })
})

describe('FileParser sessions and copies', () => {
  it('attributes a subagent file to the parent session', () => {
    const rows = parse(
      [
        humanPrompt(
          { minute: 0, uuid: 'p1', session: 'S1', sidechain: true },
          'task for the agent',
        ),
        assistant(
          { minute: 1, uuid: 'a1', session: 'S1', sidechain: true },
          { id: 'm', request: 'r', usage: { output: 3 } },
        ),
      ],
      { session: 'PARENT', subagent: true },
    )

    expect(rows.prompts).toHaveLength(0)
    expect(rows.answers[0]).toMatchObject({ session: 'PARENT', subagent: true })
    expect(rows.spans.map((span) => span.session)).toEqual(['PARENT'])
  })

  it('skips history a fork copied from another file, including rows without keys', () => {
    const copied = new Set([keyOf('p-old'), keyOf('m-old\nr-old')])
    const isCopy = (_table: CopyTable, key: number) => copied.has(key)
    const rows = parse(
      [
        humanPrompt({ minute: 0, uuid: 'p-old' }, 'old question'),
        attachment({ minute: 1, uuid: 'x-old' }),
        assistant(
          { minute: 2, uuid: 'a-old' },
          { id: 'm-old', request: 'r-old', usage: { output: 1 } },
        ),
        humanPrompt({ minute: 60, uuid: 'p-new' }, 'new question'),
        assistant(
          { minute: 61, uuid: 'a-new' },
          { id: 'm-new', request: 'r-new', usage: { output: 1 } },
        ),
      ],
      { isCopy },
    )

    expect(rows.prompts.map((prompt) => prompt.key)).toEqual([keyOf('p-new')])
    expect(rows.answers.map((answer) => answer.key)).toEqual([keyOf('m-new\nr-new')])
    expect(rows.spans).toEqual([expect.objectContaining({ start: atMs(60), end: atMs(61) })])
  })

  it('splits activity at human messages and long pauses', () => {
    const rows = parse([
      humanPrompt({ minute: 0, uuid: 'p1' }, 'go'),
      assistant({ minute: 1, uuid: 'a1' }, { id: 'm1', request: 'r1', usage: { output: 1 } }),
      assistant({ minute: 3, uuid: 'a2' }, { id: 'm2', request: 'r2', usage: { output: 1 } }),
      attachment({ minute: 23, uuid: 'x1' }),
      attachment({ minute: 24, uuid: 'x2' }),
      humanPrompt({ minute: 26, uuid: 'p2' }, 'again'),
    ])

    expect(rows.spans.map((span) => [span.start, span.end])).toEqual([
      [atMs(0), atMs(3)],
      [atMs(23), atMs(24)],
      [atMs(26), atMs(26)],
    ])
  })

  it('continues the open span of the previous pass', () => {
    const parser = new FileParser(context(), {
      start: atMs(0),
      end: atMs(2),
      cwd: '/w',
      session: 'S1',
    })

    parser.line(
      assistant({ minute: 5, uuid: 'a1' }, { id: 'm', request: 'r', usage: { output: 1 } }),
    )

    expect(parser.take().spans).toEqual([expect.objectContaining({ start: atMs(0), end: atMs(5) })])
  })
})

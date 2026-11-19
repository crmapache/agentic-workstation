import { it, expect, describe } from 'vitest'

import type { JournalFile, JournalParser } from '../journals/journal-format'
import type { ParsedRows } from '../transcripts/parsed-rows'
import { codexJournal } from './codex-journal'
import {
  atMs,
  item,
  THREAD,
  rollout,
  settings,
  userItem,
  callOutput,
  customCall,
  tokenCount,
  sessionMeta,
  taskStarted,
  turnContext,
  usageRecord,
  userMessage,
  functionCall,
  taskComplete,
} from './__fixtures__/rollout-lines'

const file: JournalFile = {
  path: `/codex/sessions/2026/11/18/rollout-2026-11-18T10-00-00-${THREAD}.jsonl`,
  size: 0,
  mtimeMs: 0,
  birthtimeMs: 0,
  session: THREAD,
  subagent: false,
}

const tools = { knownTool: () => null, isCopy: () => false }

const feed = (parser: JournalParser, text: string) => {
  for (const row of text.split('\n')) if (row) parser.line(Buffer.from(row))
}

/** Разобрать строки одним проходом; carry - что осталось на следующий. */
const parse = (text: string, carry: string | null = null): ParsedRows & { carry: string } => {
  const parser = codexJournal.parser(file, carry, tools)

  feed(parser, text)

  return { ...parser.take(), carry: parser.carry ?? '' }
}

const PATCH_DIFF = '@@ -1,2 +1,3 @@\n line\n-old\n+new\n+more\n'

describe('Codex journal', () => {
  it('reads a turn of a new journal: answers, prompt, actions and edits', () => {
    const rows = parse(
      rollout(
        sessionMeta(0),
        taskStarted(1, 'turn-1'),
        turnContext(1),
        userItem(2, 'u1', 'fix the build'),
        functionCall(3, 'call-1', 'js', { code: '1' }),
        usageRecord(3, 'resp-1', 1000, 800, 50),
        tokenCount(3, 1050, { input: 1000, cached: 800, output: 50 }),
        item(4, { type: 'McpToolCall', id: 'call-1', server: 'shotter', tool: 'capture' }),
        item(5, {
          type: 'CommandExecution',
          id: 'cmd-1',
          command: ['/bin/zsh', '-lc', 'git pull'],
        }),
        item(6, {
          type: 'FileChange',
          id: 'fc-1',
          status: 'completed',
          changes: {
            '/work/app/new.ts': { type: 'add', content: 'a\nb\n' },
            '/work/app/old.ts': { type: 'update', unified_diff: PATCH_DIFF, move_path: null },
          },
        }),
        item(7, {
          type: 'FileChange',
          id: 'fc-2',
          status: 'failed',
          changes: { '/work/app/x.ts': { type: 'add', content: 'x\n' } },
        }),
        usageRecord(8, 'resp-2', 2000, 1500, 30),
        taskComplete(9, 'turn-1'),
      ),
    )

    // Вход OpenAI несёт кеш внутри - в статистике input только свежий.
    expect(rows.answers).toEqual([
      expect.objectContaining({ model: 'gpt-6-sol', input: 200, cacheRead: 800, output: 50 }),
      expect.objectContaining({ input: 500, cacheRead: 1500, output: 30, session: THREAD }),
    ])
    expect(rows.prompts).toEqual([
      expect.objectContaining({ ts: atMs(1), human: true, session: THREAD, cwd: '/work/app' }),
    ])
    expect(rows.toolCalls.map((call) => [call.tool, call.server, call.skipEdits])).toEqual([
      ['mcp__shotter__capture', 'shotter', false],
      ['shell', null, true],
      ['apply_patch', null, false],
      ['apply_patch', null, false],
    ])
    expect(rows.edits.map((edit) => [edit.ext, edit.added, edit.removed])).toEqual([
      ['ts', 2, 0],
      ['ts', 2, 1],
    ])
  })

  it('remembers the session, model and fast mode between passes', () => {
    const first = parse(
      rollout(sessionMeta(0), settings(1, 'priority'), turnContext(1, 'gpt-6-luna')),
    )
    const second = parse(rollout(usageRecord(2, 'resp-1', 100, 0, 10)), first.carry)

    expect(second.answers).toEqual([
      expect.objectContaining({
        model: 'gpt-6-luna',
        fast: true,
        session: THREAD,
        cwd: '/work/app',
      }),
    ])
  })

  it('counts a review subagent into its parent session without prompts', () => {
    const rows = parse(
      rollout(
        sessionMeta(0, {
          id: 'child-thread',
          session_id: 'parent-thread',
          parent_thread_id: 'parent-thread',
          source: { subagent: 'review' },
        }),
        taskStarted(1, 'turn-1'),
        turnContext(1),
        userItem(1, 'u1', 'review this diff'),
        usageRecord(2, 'resp-1', 100, 0, 10),
        taskComplete(3, 'turn-1'),
      ),
    )

    expect(rows.prompts).toEqual([])
    expect(rows.answers).toEqual([
      expect.objectContaining({ session: 'parent-thread', subagent: true }),
    ])
  })

  it('starts a turn without a human message automatically', () => {
    const rows = parse(
      rollout(
        sessionMeta(0),
        taskStarted(1, 'turn-1'),
        usageRecord(2, 'resp-1', 100, 0, 10),
        taskComplete(3, 'turn-1'),
        taskStarted(30, 'turn-2'),
        userItem(30, 'u2', '<task-notification>done</task-notification>'),
      ),
    )

    expect(rows.prompts.map((prompt) => [prompt.ts, prompt.human])).toEqual([
      [atMs(1), false],
      [atMs(30), false],
    ])
    // Пауза между ходами - не работа: отрезки делятся на начале хода.
    expect(rows.spans.map((span) => [span.start, span.end])).toEqual([
      [atMs(1), atMs(3)],
      [atMs(30), atMs(30)],
    ])
  })

  it('reads an old journal: token counts, apply_patch by its output, shell and MCP calls', () => {
    const patch = '*** Begin Patch\n*** Add File: src/a.ts\n+one\n+two\n*** End Patch'
    const rows = parse(
      rollout(
        sessionMeta(0, { cli_version: '0.46.0' }),
        turnContext(0, 'gpt-5-codex'),
        userMessage(1, 'add a file'),
        customCall(2, 'call-p1', 'apply_patch', patch),
        callOutput(2, 'call-p1', 'Success. Updated the following files:\nA src/a.ts'),
        customCall(3, 'call-p2', 'apply_patch', patch),
        callOutput(3, 'call-p2', 'apply_patch verification failed'),
        functionCall(4, 'call-s1', 'shell', { command: ['bash', '-lc', 'pnpm install'] }),
        functionCall(4, 'call-m1', 'playwright__browser_click', { ref: 'e1' }),
        tokenCount(5, 500, { input: 400, cached: 100, output: 100 }),
        // Та же строка ради лимитов - тот же итог, ответ не задваивается.
        tokenCount(5, 500, { input: 400, cached: 100, output: 100 }),
      ),
    )

    expect(rows.prompts).toEqual([expect.objectContaining({ ts: atMs(1), human: true })])
    expect(rows.answers).toEqual([
      expect.objectContaining({ model: 'gpt-5-codex', input: 300, cacheRead: 100, output: 100 }),
    ])
    expect(rows.edits).toEqual([
      expect.objectContaining({ ext: 'ts', added: 2, removed: 0, ts: atMs(2) }),
    ])
    expect(rows.toolCalls.map((call) => [call.tool, call.server, call.skipEdits])).toEqual([
      ['apply_patch', null, false],
      ['apply_patch', null, false],
      ['shell', null, true],
      ['mcp__playwright__browser_click', 'playwright', false],
    ])
  })

  it('keeps an apply_patch waiting for its output across passes', () => {
    const patch = '*** Begin Patch\n*** Update File: b.ts\n@@\n-x\n+y\n*** End Patch'
    const first = parse(
      rollout(sessionMeta(0), turnContext(0), customCall(1, 'call-p', 'apply_patch', patch)),
    )
    const second = parse(
      rollout(callOutput(2, 'call-p', 'Success. Updated the following files:')),
      first.carry,
    )

    expect(first.edits).toEqual([])
    expect(second.edits).toEqual([
      expect.objectContaining({ added: 1, removed: 1, cwd: '/work/app', ts: atMs(1) }),
    ])
  })
})

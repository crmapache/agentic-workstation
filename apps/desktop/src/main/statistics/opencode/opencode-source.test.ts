import { rmSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { openStatsDb } from '../stats-db'
import { StatsStore } from '../stats-store'
import { JournalScanner } from '../journals/journal-scanner'

/** Время сообщений базы: миллисекунды, как пишет OpenCode. */
const T0 = Date.parse('2026-11-18T10:00:00.000Z')
const at = (minutes: number) => T0 + minutes * 60_000

let root = ''
let stats: DatabaseSync
let scanner: JournalScanner
let source: DatabaseSync | null = null

const dbPath = () => join(root, 'opencode.db')
const scan = (path = dbPath()) => scanner.scan([{ provider: 'opencode', path }], () => undefined)
const all = (sql: string) => stats.prepare(sql).all()

/** Подмножество схемы OpenCode 2.3.x - столбцы, которые читает статистика. */
const createSource = (mode = 'WAL') => {
  const db = new DatabaseSync(dbPath())

  db.exec(`PRAGMA journal_mode = ${mode}`)
  db.exec(`
    CREATE TABLE session_v2 (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, parent_id TEXT, directory TEXT NOT NULL,
      time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL
    );
    CREATE TABLE session_message (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL, seq INTEGER NOT NULL,
      time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL
    );
  `)
  source = db

  return db
}

const addSession = (id: string, parent: string | null = null, directory = '/work/app') =>
  source
    ?.prepare(
      'INSERT INTO session_v2 (id, project_id, parent_id, directory, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(id, 'p1', parent, directory, at(0), at(0))

let seq = 0

const putMessage = (
  id: string,
  session: string,
  type: string,
  minute: number,
  data: Record<string, unknown>,
  updated = at(minute),
) => {
  seq += 1
  source
    ?.prepare(
      `INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET time_updated = excluded.time_updated, data = excluded.data`,
    )
    .run(id, session, type, seq, at(minute), updated, JSON.stringify(data))
}

const tool = (id: string, name: string, status: string, state: Record<string, unknown>) => ({
  type: 'tool',
  id,
  name,
  executed: true,
  state: { status, ...state },
  time: { created: at(1), ran: at(1), completed: at(2) },
})

const assistant = (minute: number, output: number, content: unknown[] = [], cost = 0) => ({
  time: { created: at(minute), completed: at(minute + 2) },
  agent: 'build',
  model: { id: 'qwen3-coder:30b', providerID: 'a1b2c3d4e5f6' },
  content,
  finish: 'stop',
  cost,
  tokens: { input: 100, output, reasoning: 5, cache: { read: 300, write: 7 } },
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'stats-opencode-'))
  stats = openStatsDb(':memory:')
  scanner = new JournalScanner(new StatsStore(stats))
  seq = 0
})

afterEach(() => {
  source?.close()
  source = null
  stats.close()
  rmSync(root, { recursive: true, force: true })
})

describe('OpenCode database', () => {
  it('reads prompts, answers with the stored cost, tool calls and edits', async () => {
    createSource()
    addSession('ses_root')
    addSession('ses_child', 'ses_root')
    putMessage('msg_u1', 'ses_root', 'user', 0, { time: { created: at(0) }, text: 'add tests' })
    putMessage(
      'msg_a1',
      'ses_root',
      'assistant',
      1,
      assistant(
        1,
        40,
        [
          { type: 'reasoning', text: '...' },
          tool('call_1', 'edit', 'completed', {
            input: { path: 'src/a.ts', oldString: 'a', newString: 'b' },
            metadata: { files: [{ file: '/work/app/src/a.ts', additions: 3, deletions: 1 }] },
          }),
          tool('call_2', 'write', 'completed', {
            input: { path: 'src/new.ts', content: 'one\ntwo\n' },
          }),
          tool('call_3', 'edit', 'error', { input: { path: 'src/c.ts' }, error: { type: 'x' } }),
          tool('call_4', 'shell', 'completed', { input: { command: 'git checkout main' } }),
          tool('call_5', 'notifications_notify', 'completed', { input: { title: 'done' } }),
          // Code Mode: поиск инструментов не в счёт, вызов коннектора из кода - как прямой.
          tool('call_6', 'execute', 'completed', {
            input: { code: 'await tools.gmail.get_thread({ id: "t1" })' },
            metadata: {
              toolCalls: [
                { tool: 'search', status: 'completed', input: { query: 'mail' } },
                { tool: 'gmail.get_thread', status: 'completed', input: { id: 't1' } },
              ],
            },
          }),
        ],
        0.25,
      ),
    )
    putMessage('msg_c1', 'ses_child', 'user', 2, { time: { created: at(2) }, text: 'subtask' })
    putMessage('msg_c2', 'ses_child', 'assistant', 2, assistant(2, 10))

    const result = await scan()

    expect(result).toMatchObject({ changed: true, filesTotal: 1, filesDone: 1 })
    expect(all('SELECT uuid, provider FROM sessions')).toEqual([
      { uuid: 'ses_root', provider: 'opencode' },
    ])
    expect(all('SELECT human FROM prompts')).toEqual([{ human: 1 }])
    expect(
      all(
        'SELECT model, input, output, cache_read, cache_write, cost, subagent FROM answers ORDER BY output DESC',
      ),
    ).toEqual([
      {
        model: 'qwen3-coder:30b',
        input: 100,
        output: 45,
        cache_read: 300,
        cache_write: 7,
        cost: 0.25,
        subagent: 0,
      },
      expect.objectContaining({ output: 15, cost: 0, subagent: 1 }),
    ])
    expect(all('SELECT tool, server, skip_edits FROM tool_calls ORDER BY ts, tool')).toEqual([
      { tool: 'edit', server: null, skip_edits: 0 },
      { tool: 'edit', server: null, skip_edits: 0 },
      { tool: 'execute', server: null, skip_edits: 0 },
      { tool: 'mcp__gmail__get_thread', server: 'gmail', skip_edits: 0 },
      { tool: 'mcp__notifications__notify', server: 'notifications', skip_edits: 0 },
      { tool: 'shell', server: null, skip_edits: 1 },
      { tool: 'write', server: null, skip_edits: 0 },
    ])
    expect(all('SELECT ext, added, removed FROM edits ORDER BY added')).toEqual([
      { ext: 'ts', added: 2, removed: 0 },
      { ext: 'ts', added: 3, removed: 1 },
    ])
    // Ход: от сообщения человека до конца ответов, субагент - внутри него.
    expect(all('SELECT started_at, ended_at FROM turns')).toEqual([
      { started_at: at(1), ended_at: at(4) },
    ])
  })

  it('reads only messages changed since the last pass', async () => {
    createSource()
    addSession('ses_root')
    putMessage('msg_a1', 'ses_root', 'assistant', 1, assistant(1, 10))
    await scan()

    expect((await scan()).changed).toBe(false)

    // Ответ дописан (тот же id, позже правка) и пришёл новый.
    putMessage('msg_a1', 'ses_root', 'assistant', 1, assistant(1, 50), at(5))
    putMessage('msg_a2', 'ses_root', 'assistant', 6, assistant(6, 7), at(6))

    expect((await scan()).changed).toBe(true)
    expect(all('SELECT output FROM answers ORDER BY ts')).toEqual([{ output: 55 }, { output: 12 }])
  })

  it('skips a missing database, an unknown schema and a locked one without failing', async () => {
    expect(await scan(join(root, 'none.db'))).toMatchObject({ changed: false })

    writeFileSync(join(root, 'empty.db'), '')
    expect(await scan(join(root, 'empty.db'))).toMatchObject({ changed: false })

    const other = new DatabaseSync(join(root, 'other.db'))

    other.exec('CREATE TABLE message (id TEXT PRIMARY KEY, data TEXT)')
    other.close()
    expect(await scan(join(root, 'other.db'))).toMatchObject({ changed: false })

    const db = createSource('DELETE')

    addSession('ses_root')
    putMessage('msg_a1', 'ses_root', 'assistant', 1, assistant(1, 10))
    db.exec('BEGIN EXCLUSIVE')

    try {
      expect(await scan()).toMatchObject({ changed: false })
    } finally {
      db.exec('ROLLBACK')
    }

    expect(all('SELECT COUNT(*) AS n FROM answers')).toEqual([{ n: 0 }])
  })
})

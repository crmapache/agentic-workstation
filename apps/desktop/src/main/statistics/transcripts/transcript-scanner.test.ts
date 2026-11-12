import { rmSync, mkdirSync, mkdtempSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { openStatsDb } from '../stats-db'
import { StatsStore } from '../stats-store'
import { TranscriptScanner } from './transcript-scanner'
import { hunk, toolUse, assistant, toolResult, humanPrompt } from './__fixtures__/transcript-lines'

let root = ''
let db: DatabaseSync
let scanner: TranscriptScanner

const project = () => join(root, '-work-app')
const mainFile = () => join(project(), 'S1.jsonl')
const lines = (...rows: Buffer[]) => rows.map((row) => `${row.toString()}\n`).join('')
const count = (table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
const scan = () => scanner.scan(root, () => undefined)

const answer = (minute: number, id: string, output: number) =>
  assistant({ minute, uuid: `u-${id}` }, { id, request: `r-${id}`, usage: { input: 10, output } })

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'stats-scan-'))
  mkdirSync(project(), { recursive: true })
  db = openStatsDb(join(root, 'stats.sqlite'))
  scanner = new TranscriptScanner(new StatsStore(db))
})

afterEach(() => {
  db.close()
  rmSync(root, { recursive: true, force: true })
})

describe('TranscriptScanner', () => {
  it('reads only what was appended since the last pass', async () => {
    writeFileSync(
      mainFile(),
      lines(humanPrompt({ minute: 0, uuid: 'p1' }, 'go'), answer(1, 'm1', 5)),
    )

    const first = await scan()

    expect(first.bytesDone).toBeGreaterThan(0)
    expect(count('answers')).toBe(1)

    // Та же строка ответа с выросшим выходом и новый ответ.
    appendFileSync(mainFile(), lines(answer(2, 'm1', 40), answer(3, 'm2', 7)))

    const second = await scan()
    const output = db.prepare('SELECT SUM(output) AS n FROM answers').get() as { n: number }

    expect(second.filesDone).toBe(1)
    expect(count('answers')).toBe(2)
    expect(output.n).toBe(47)
    expect((await scan()).filesTotal).toBe(0)
  })

  it('leaves a half-written line for the next pass', async () => {
    const full = answer(1, 'm1', 5).toString()

    writeFileSync(
      mainFile(),
      `${humanPrompt({ minute: 0, uuid: 'p1' }, 'go').toString()}\n${full.slice(0, 40)}`,
    )
    await scan()
    expect(count('answers')).toBe(0)

    appendFileSync(mainFile(), `${full.slice(40)}\n`)
    await scan()
    expect(count('answers')).toBe(1)
  })

  it('re-reads a file that got shorter and replaces its rows', async () => {
    writeFileSync(
      mainFile(),
      lines(humanPrompt({ minute: 0, uuid: 'p1' }, 'go'), answer(1, 'm1', 5), answer(2, 'm2', 5)),
    )
    await scan()
    expect(count('answers')).toBe(2)

    writeFileSync(mainFile(), lines(answer(1, 'm9', 3)))
    await scan()

    const keys = db.prepare('SELECT model, output FROM answers').all()

    expect(keys).toEqual([expect.objectContaining({ output: 3 })])
    expect(count('prompts')).toBe(0)
  })

  it('counts subagent work into the parent session and estimates the turn', async () => {
    const subagents = join(project(), 'S1', 'subagents', 'workflows', 'wf_1')

    mkdirSync(subagents, { recursive: true })
    writeFileSync(
      mainFile(),
      lines(
        humanPrompt({ minute: 0, uuid: 'p1' }, 'go'),
        assistant({ minute: 1, uuid: 'a1' }, { id: 'm1', request: 'r1', usage: { output: 1 } }, [
          toolUse('t1', 'Edit', { file_path: '/work/app/a.ts' }),
        ]),
        toolResult({ minute: 2, uuid: 'r1' }, 't1', {
          filePath: '/work/app/a.ts',
          structuredPatch: [hunk(['+x', '+y'])],
        }),
        answer(20, 'm2', 1),
      ),
    )
    writeFileSync(
      join(subagents, 'agent-1.jsonl'),
      lines(
        assistant(
          { minute: 8, uuid: 's1', session: 'S1', sidechain: true },
          { id: 'sm1', request: 'sr1', usage: { output: 2 } },
        ),
        assistant(
          { minute: 14, uuid: 's2', session: 'S1', sidechain: true },
          { id: 'sm2', request: 'sr2', usage: { output: 2 } },
        ),
      ),
    )
    await scan()

    const sessions = db.prepare('SELECT DISTINCT session FROM answers').all()
    const subagent = db.prepare('SELECT COUNT(*) AS n FROM answers WHERE subagent = 1').get()
    const turns = db.prepare('SELECT SUM(work_ms) AS ms FROM turns').get() as { ms: number }
    const edits = db.prepare('SELECT added FROM edits').all()

    expect(sessions).toHaveLength(1)
    expect(subagent).toEqual(expect.objectContaining({ n: 2 }))
    // 0-2 основной файл, 8-14 субагент, 20 - ответ: паузы по 6 минут мостятся, всё - один ход.
    expect(turns.ms).toBe(20 * 60_000)
    expect(edits).toEqual([expect.objectContaining({ added: 2 })])
  })
})

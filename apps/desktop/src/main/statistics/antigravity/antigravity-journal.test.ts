import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { ANTIGRAVITY_PLACES, antigravityJournal } from './antigravity-journal'

let gemini = ''

beforeEach(async () => {
  gemini = await mkdtemp(join(tmpdir(), 'agy-journal-'))
})

afterEach(async () => {
  await rm(gemini, { recursive: true, force: true })
})

/** Шаги `transcript.jsonl` `agy` 1.5.12 (сняты с живой сессии, ADR 0092). */
const STEPS = [
  {
    step_index: 0,
    source: 'USER_EXPLICIT',
    type: 'USER_INPUT',
    status: 'DONE',
    created_at: '2026-11-19T13:28:52Z',
    content: '<USER_REQUEST>Reply OK</USER_REQUEST>',
  },
  {
    step_index: 1,
    source: 'MODEL',
    type: 'PLANNER_RESPONSE',
    status: 'DONE',
    created_at: '2026-11-19T13:28:55Z',
    model: 'gemini-3.8-flash-low',
    input_tokens: 9166,
    cache_read_tokens: 120,
    output_tokens: 1,
    content: 'OK',
  },
]

describe('журналы Antigravity для статистики', () => {
  it('шаги модели - расход, папка разговора - из списка разговоров IDE', async () => {
    const root = join(gemini, 'antigravity-cli')
    const logs = join(root, 'brain', 'conv-1', '.system_generated', 'logs')

    await mkdir(logs, { recursive: true })
    await writeFile(join(logs, 'transcript.jsonl'), STEPS.map((s) => JSON.stringify(s)).join('\n'))
    await writeFile(
      join(gemini, ANTIGRAVITY_PLACES),
      `${JSON.stringify({ sessionId: 'conv-1', cwd: '/work/proj' })}\n`,
    )

    const [file] = await antigravityJournal.walk(root)

    expect(file).toMatchObject({ session: 'conv-1', cwd: '/work/proj' })

    const parser = antigravityJournal.parser(file!, null, {
      knownTool: () => null,
      isCopy: () => false,
    })

    for (const step of STEPS) parser.line(Buffer.from(JSON.stringify(step)))

    const rows = parser.take()

    expect(rows.prompts[0]).toMatchObject({ human: true, cwd: '/work/proj' })
    expect(rows.answers[0]).toMatchObject({
      model: 'gemini-3.8-flash-low',
      input: 9166,
      cacheRead: 120,
      output: 1,
    })
  })

  it('шаг без model (agy до 1.5.12) засчитан по токенам, последний ход - с отрезком', () => {
    const file = { path: '/x', size: 0, mtimeMs: 0, birthtimeMs: 0, session: 's', subagent: false }
    const parser = antigravityJournal.parser(file, null, {
      knownTool: () => null,
      isCopy: () => false,
    })

    parser.line(Buffer.from(JSON.stringify(STEPS[0])))
    parser.line(Buffer.from(JSON.stringify({ ...STEPS[1], model: undefined })))

    const rows = parser.take()

    expect(rows.answers[0]).toMatchObject({ model: '', input: 9166 })
    expect(rows.spans).toEqual([
      {
        start: Date.parse('2026-11-19T13:28:52Z'),
        end: Date.parse('2026-11-19T13:28:55Z'),
        cwd: '',
        session: 's',
      },
    ])
  })
})

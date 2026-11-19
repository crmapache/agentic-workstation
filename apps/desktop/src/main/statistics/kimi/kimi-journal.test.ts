import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { kimiJournal } from './kimi-journal'

let home = ''

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'kimi-journal-'))
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

/** Строки `wire.jsonl` Kimi 2.7 (сняты с живой сессии, ADR 0092). */
const WIRE = [
  { type: 'metadata', protocol_version: '1.5', created_at: 1795094895614 },
  {
    type: 'turn.prompt',
    agentId: 'main',
    origin: { kind: 'user' },
    promptId: 'msg_1',
    turnId: 0,
    time: 1795094895654,
  },
  {
    type: 'usage.record',
    agentId: 'main',
    model: 'kimi-code/k3',
    usage: { inputOther: 15275, output: 15, inputCacheRead: 100, inputCacheCreation: 7 },
    usageScope: 'turn',
    time: 1795094934135,
  },
  { type: 'turn.ended', agentId: 'main', turnId: 0, reason: 'completed', time: 1795094934138 },
]

describe('журналы Kimi Code для статистики', () => {
  it('находит wire.jsonl разговоров с папкой из state.json и читает расход, запрос и ход', async () => {
    const session = join(home, 'sessions', 'wd_proj_1', 'session_abc')

    await mkdir(join(session, 'agents', 'main'), { recursive: true })
    await writeFile(join(session, 'state.json'), JSON.stringify({ cwd: '/work/proj' }))
    await writeFile(
      join(session, 'agents', 'main', 'wire.jsonl'),
      WIRE.map((row) => JSON.stringify(row)).join('\n') + '\n',
    )

    const [file] = await kimiJournal.walk(home)

    expect(file).toMatchObject({ session: 'session_abc', subagent: false, cwd: '/work/proj' })

    const parser = kimiJournal.parser(file!, null, {
      knownTool: () => null,
      isCopy: () => false,
    })

    for (const row of WIRE) parser.line(Buffer.from(JSON.stringify(row)))

    const rows = parser.take()

    expect(rows.prompts).toHaveLength(1)
    expect(rows.prompts[0]).toMatchObject({ human: true, cwd: '/work/proj' })
    expect(rows.answers[0]).toMatchObject({
      model: 'kimi-code/k3',
      input: 15275,
      output: 15,
      cacheRead: 100,
      cacheWrite: 7,
    })
    expect(rows.spans).toEqual([
      { start: 1795094895654, end: 1795094934138, cwd: '/work/proj', session: 'session_abc' },
    ])
  })

  it('формат 1.4 без turn.ended: ход кончается своей последней записью', () => {
    const file = { path: '/x', size: 0, mtimeMs: 0, birthtimeMs: 0, session: 's', subagent: false }
    const parser = kimiJournal.parser(file, null, { knownTool: () => null, isCopy: () => false })
    const lines = [
      { type: 'turn.prompt', origin: { kind: 'user' }, promptId: 'a', time: 100 },
      { type: 'usage.record', model: 'm', usage: { output: 1 }, time: 150 },
      { type: 'turn.prompt', origin: { kind: 'user' }, promptId: 'b', time: 200 },
      { type: 'usage.record', model: 'm', usage: { output: 1 }, time: 260 },
    ]

    for (const row of lines) parser.line(Buffer.from(JSON.stringify(row)))

    expect(parser.take().spans.map(({ start, end }) => [start, end])).toEqual([
      [100, 150],
      [200, 260],
    ])
  })
})

import { rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach } from 'vitest'

import type { ProviderId } from '@shared/providers'

import { writeMeta, openStatsDb } from './stats-db'
import { StatsEngine } from './stats-engine'
import { StatsStore } from './stats-store'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('StatsEngine', () => {
  it('reprices answers of priced providers by the price of their day and keeps the cost OpenCode stored', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stats-engine-'))
    const path = join(dir, 'statistics.sqlite')
    const db = openStatsDb(path)
    const store = new StatsStore(db)
    const insert = db.prepare(
      `INSERT INTO answers (ts, key, file, place, session, model, input, output, cache_read,
         cache_write, cache_write_1h, fast, cost, subagent)
       VALUES (?, ?, NULL, NULL, ?, ?, 1000000, 0, 0, 0, 0, 0, 7, 0)`,
    )
    const answer = (key: number, provider: ProviderId, model: string, ts = key) =>
      insert.run(ts, key, store.sessionId(`S${key}`, provider), model)

    dirs.push(dir)
    answer(1, 'claude', 'claude-opus-5-5')
    // Миллион свежего входа - длинный запрос: длинная карточка GPT-6 Sol, 4 за миллион.
    answer(2, 'codex', 'gpt-6-sol')
    answer(3, 'opencode', 'qwen3-coder:30b')
    // Gemini 3.8 Flash по акции Google - 0.75 за миллион входа, с 2027 года - 1.5.
    answer(4, 'antigravity', 'gemini-3.8-flash-high')
    answer(5, 'antigravity', 'gemini-3.8-flash-high', Date.UTC(2027, 0, 2))
    answer(6, 'kimi', 'kimi-code/k3')
    writeMeta(db, 'prices_version', 'old')
    db.close()

    const engine = new StatsEngine(path)

    engine.close()

    const check = openStatsDb(path)
    const costs = check.prepare('SELECT key, cost FROM answers ORDER BY key').all()

    check.close()
    expect(costs).toEqual([
      { key: 1, cost: 4 },
      { key: 2, cost: 4 },
      { key: 3, cost: 7 },
      { key: 4, cost: 0.75 },
      { key: 5, cost: 1.5 },
      { key: 6, cost: 3 },
    ])
  })
})

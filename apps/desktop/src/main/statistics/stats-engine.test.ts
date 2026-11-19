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
  it('reprices Claude and Codex answers on new prices and keeps the cost OpenCode stored', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stats-engine-'))
    const path = join(dir, 'statistics.sqlite')
    const db = openStatsDb(path)
    const store = new StatsStore(db)
    const insert = db.prepare(
      `INSERT INTO answers (ts, key, file, place, session, model, input, output, cache_read,
         cache_write, cache_write_1h, fast, cost, subagent)
       VALUES (?, ?, NULL, NULL, ?, ?, 1000000, 0, 0, 0, 0, 0, 7, 0)`,
    )
    const answer = (key: number, provider: ProviderId, model: string) =>
      insert.run(key, key, store.sessionId(`S${key}`, provider), model)

    dirs.push(dir)
    answer(1, 'claude', 'claude-opus-5-5')
    // Миллион свежего входа - длинный запрос: длинная карточка GPT-6 Sol, 4 за миллион.
    answer(2, 'codex', 'gpt-6-sol')
    answer(3, 'opencode', 'qwen3-coder:30b')
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
    ])
  })
})

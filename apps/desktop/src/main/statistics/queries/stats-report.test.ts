import type { DatabaseSync } from 'node:sqlite'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { StatsFilter } from '@shared/statistics'
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@shared/time-units'

import { openStatsDb } from '../stats-db'
import { StatsStore } from '../stats-store'
import { LiveNotes } from '../live/live-notes'
import { buildReport } from './stats-report'

/** Местная полночь 10 ноября 2026: дни теста - по часам машины, как у окна. */
const D0 = new Date(2026, 10, 10).getTime()
const ALL: StatsFilter = { source: 'all', project: null }

let db: DatabaseSync
let store: StatsStore
let notes: LiveNotes

const place = (path: string) => {
  const id = store.placeId(path)

  db.prepare('UPDATE places SET project = ? WHERE id = ?').run(path, id)

  return id
}

const answer = (
  key: number,
  ts: number,
  session: string,
  tokens: Partial<Record<string, number>> = {},
  project = '/p/a',
) =>
  db
    .prepare(
      `INSERT INTO answers (ts, key, file, place, session, model, input, output, cache_read,
         cache_write, cache_write_1h, fast, cost, subagent)
       VALUES (?, ?, 1, ?, ?, 'claude-opus-5-5', ?, ?, ?, ?, 0, 0, ?, 0)`,
    )
    .run(
      ts,
      key,
      place(project),
      store.sessionId(session, 'claude'),
      tokens['input'] ?? 0,
      tokens['output'] ?? 0,
      tokens['cacheRead'] ?? 0,
      tokens['cacheWrite'] ?? 0,
      tokens['cost'] ?? 0,
    )

const turn = (session: string, start: number, end: number, exact = 0, project = '/p/a') =>
  db
    .prepare(
      `INSERT INTO turns (key, session, place, started_at, ended_at, work_ms, exact)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `${exact ? 'x' : 'e'}:${session}:${start}`,
      store.sessionId(session, 'claude'),
      place(project),
      start,
      end,
      end - start,
      exact,
    )

const prompt = (key: number, ts: number, session: string, human = 1) =>
  db
    .prepare('INSERT INTO prompts (ts, key, file, place, session, human) VALUES (?, ?, 1, ?, ?, ?)')
    .run(ts, key, place('/p/a'), store.sessionId(session, 'claude'), human)

const report = (from: number, to: number, filter = ALL, now = D0 + 12 * HOUR_MS) =>
  buildReport(db, { from, to }, filter, now)

beforeEach(() => {
  db = openStatsDb(':memory:')
  store = new StatsStore(db)
  notes = new LiveNotes(store)
})

afterEach(() => db.close())

describe('buildReport totals', () => {
  it('sums tokens, cost and cache share for the period only', () => {
    answer(1, D0 + HOUR_MS, 'S1', {
      input: 10,
      output: 20,
      cacheRead: 70,
      cacheWrite: 20,
      cost: 1.5,
    })
    answer(2, D0 + 2 * HOUR_MS, 'S2', { input: 5, output: 5, cost: 0.5 })
    answer(3, D0 + DAY_MS + HOUR_MS, 'S1', { input: 1000, cost: 9 })

    const { totals } = report(D0, D0 + DAY_MS)

    expect(totals.tokens).toEqual({ input: 15, output: 25, cacheRead: 70, cacheWrite: 20 })
    expect(totals.cost).toBeCloseTo(2)
    expect(totals.cacheShare).toBeCloseTo(70 / 105)
    expect(totals.answers).toBe(2)
    expect(totals.sessions).toBe(2)
  })

  it('counts human messages but not scenario steps or automatic turns', () => {
    prompt(1, D0 + HOUR_MS, 'S1')
    prompt(2, D0 + HOUR_MS + MINUTE_MS, 'S1', 0)
    prompt(3, D0 + 2 * HOUR_MS, 'RUN')
    notes.write({
      kind: 'ideSession',
      provider: 'claude',
      session: 'RUN',
      ideKind: 'scenario',
      at: D0,
    })

    expect(report(D0, D0 + DAY_MS).totals.prompts).toBe(1)
  })

  it('has no previous period when it would start before the data', () => {
    answer(1, D0 + HOUR_MS, 'S1', { output: 1 })
    answer(2, D0 + DAY_MS + HOUR_MS, 'S1', { output: 2 })

    expect(report(D0 + HOUR_MS, D0 + DAY_MS + HOUR_MS).previous).toBeNull()
    // Прошлый период начинается ровно с первой записи - он целиком в данных.
    expect(report(D0 + DAY_MS + HOUR_MS, D0 + 2 * DAY_MS + HOUR_MS).previous?.tokens.output).toBe(1)
  })
})

describe('buildReport agent time', () => {
  it('adds parallel agents for work and unites them for wall-clock time', () => {
    turn('S1', D0 + 10 * HOUR_MS, D0 + 10 * HOUR_MS + 30 * MINUTE_MS)
    turn('S2', D0 + 10 * HOUR_MS + 20 * MINUTE_MS, D0 + 11 * HOUR_MS)

    const { totals } = report(D0, D0 + DAY_MS)

    expect(totals.agentWorkMs).toBe(70 * MINUTE_MS)
    expect(totals.agentWorkEstimatedMs).toBe(70 * MINUTE_MS)
    expect(totals.agentWallMs).toBe(60 * MINUTE_MS)
  })

  it('lets a live turn replace the transcript estimate of the same session', () => {
    turn('S1', D0 + 10 * HOUR_MS, D0 + 11 * HOUR_MS)
    notes.write({
      kind: 'turn',
      note: {
        provider: 'claude',
        session: 'S1',
        project: '/p/a',
        startedAt: D0 + 10 * HOUR_MS,
        endedAt: D0 + 10 * HOUR_MS + 50 * MINUTE_MS,
        workMs: 40 * MINUTE_MS,
      },
    })

    const { totals } = report(D0, D0 + DAY_MS)

    expect(totals.agentWorkMs).toBe(40 * MINUTE_MS)
    expect(totals.agentWorkEstimatedMs).toBe(0)
  })

  it('measures how long agents worked while the human was away', () => {
    turn('S1', D0 + 10 * HOUR_MS, D0 + 10 * HOUR_MS + 30 * MINUTE_MS)
    notes.write({
      kind: 'presence',
      entries: Array.from({ length: 10 }, (_, index) => ({
        minute: (D0 + 10 * HOUR_MS) / MINUTE_MS + 10 + index,
        project: '/p/other',
      })),
    })

    const { totals, workSessions } = report(D0, D0 + DAY_MS)

    expect(totals.agentsWithoutYouMs).toBe(20 * MINUTE_MS)
    expect(totals.presenceMinutes).toBe(10)
    expect(workSessions).toEqual({ count: 1, longestMinutes: 10, averageMinutes: 10 })
  })

  it('splits by source and project', () => {
    answer(1, D0 + HOUR_MS, 'PANEL', { output: 3 }, '/p/a')
    answer(2, D0 + HOUR_MS, 'CLI', { output: 7 }, '/p/b')
    notes.write({
      kind: 'ideSession',
      provider: 'claude',
      session: 'PANEL',
      ideKind: 'panel',
      at: D0,
    })

    expect(report(D0, D0 + DAY_MS, { source: 'ide', project: null }).totals.tokens.output).toBe(3)
    expect(report(D0, D0 + DAY_MS, { source: 'outside', project: null }).totals.tokens.output).toBe(
      7,
    )
    expect(report(D0, D0 + DAY_MS, { source: 'all', project: '/p/b' }).totals.tokens.output).toBe(7)
  })
})

describe('buildReport habits and series', () => {
  it('counts streaks from presence and human messages', () => {
    const minuteOf = (day: number) => (D0 + day * DAY_MS + 9 * HOUR_MS) / MINUTE_MS

    notes.write({
      kind: 'presence',
      entries: [-2, -1].map((day) => ({ minute: minuteOf(day), project: '/p/a' })),
    })
    prompt(1, D0 - 5 * DAY_MS + HOUR_MS, 'S1')

    expect(report(D0, D0 + DAY_MS).streaks).toEqual({ current: 2, best: 2, activeToday: false })
  })

  it('buckets a day by local hours', () => {
    answer(1, D0 + 9 * HOUR_MS + 5 * MINUTE_MS, 'S1', { output: 4 })
    answer(2, D0 + 9 * HOUR_MS + 50 * MINUTE_MS, 'S1', { output: 6 })
    turn('S1', D0 + 9 * HOUR_MS + 30 * MINUTE_MS, D0 + 10 * HOUR_MS + 15 * MINUTE_MS)

    const { series } = report(D0, D0 + DAY_MS)

    expect(series.bucket).toBe('hour')
    expect(series.points).toHaveLength(24)
    expect(series.points[9]).toMatchObject({ tokens: 10, agentMinutes: 30 })
    expect(series.points[10]).toMatchObject({ tokens: 0, agentMinutes: 15 })
  })
})

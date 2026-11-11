import type { DatabaseSync } from 'node:sqlite'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { StatsFilter, StatsScanProgress } from '@shared/statistics'

import { openStatsDb } from '../stats-db'
import { StatsStore } from '../stats-store'
import { LiveNotes } from '../live/live-notes'
import { buildReport } from './stats-report'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
/** Местная полночь 10 ноября 2026: дни теста - по часам машины, как у окна. */
const D0 = new Date(2026, 10, 10).getTime()
const ALL: StatsFilter = { source: 'all', project: null }
const SCAN: StatsScanProgress = {
  running: false,
  firstPassDone: true,
  filesDone: 0,
  filesTotal: 0,
  bytesDone: 0,
  bytesTotal: 0,
  lastScanAt: null,
}

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

const report = (from: number, to: number, filter = ALL, now = D0 + 12 * HOUR) =>
  buildReport(db, { from, to }, filter, now, SCAN)

beforeEach(() => {
  db = openStatsDb(':memory:')
  store = new StatsStore(db)
  notes = new LiveNotes(store)
})

afterEach(() => db.close())

describe('buildReport totals', () => {
  it('sums tokens, cost and cache share for the period only', () => {
    answer(1, D0 + HOUR, 'S1', { input: 10, output: 20, cacheRead: 70, cacheWrite: 20, cost: 1.5 })
    answer(2, D0 + 2 * HOUR, 'S2', { input: 5, output: 5, cost: 0.5 })
    answer(3, D0 + DAY + HOUR, 'S1', { input: 1000, cost: 9 })

    const { totals } = report(D0, D0 + DAY)

    expect(totals.tokens).toEqual({ input: 15, output: 25, cacheRead: 70, cacheWrite: 20 })
    expect(totals.cost).toBeCloseTo(2)
    expect(totals.cacheShare).toBeCloseTo(70 / 105)
    expect(totals.answers).toBe(2)
    expect(totals.sessions).toBe(2)
  })

  it('counts human messages but not scenario steps or automatic turns', () => {
    prompt(1, D0 + HOUR, 'S1')
    prompt(2, D0 + HOUR + MIN, 'S1', 0)
    prompt(3, D0 + 2 * HOUR, 'RUN')
    notes.write({
      kind: 'ideSession',
      provider: 'claude',
      session: 'RUN',
      ideKind: 'scenario',
      at: D0,
    })

    expect(report(D0, D0 + DAY).totals.prompts).toBe(1)
  })

  it('has no previous period when it would start before the data', () => {
    answer(1, D0 + HOUR, 'S1', { output: 1 })
    answer(2, D0 + DAY + HOUR, 'S1', { output: 2 })

    expect(report(D0 + HOUR, D0 + DAY + HOUR).previous).toBeNull()
    // Прошлый период начинается ровно с первой записи - он целиком в данных.
    expect(report(D0 + DAY + HOUR, D0 + 2 * DAY + HOUR).previous?.tokens.output).toBe(1)
  })
})

describe('buildReport agent time', () => {
  it('adds parallel agents for work and unites them for wall-clock time', () => {
    turn('S1', D0 + 10 * HOUR, D0 + 10 * HOUR + 30 * MIN)
    turn('S2', D0 + 10 * HOUR + 20 * MIN, D0 + 11 * HOUR)

    const { totals } = report(D0, D0 + DAY)

    expect(totals.agentWorkMs).toBe(70 * MIN)
    expect(totals.agentWorkEstimatedMs).toBe(70 * MIN)
    expect(totals.agentWallMs).toBe(60 * MIN)
  })

  it('lets a live turn replace the transcript estimate of the same session', () => {
    turn('S1', D0 + 10 * HOUR, D0 + 11 * HOUR)
    notes.write({
      kind: 'turn',
      note: {
        provider: 'claude',
        session: 'S1',
        project: '/p/a',
        startedAt: D0 + 10 * HOUR,
        endedAt: D0 + 10 * HOUR + 50 * MIN,
        workMs: 40 * MIN,
      },
    })

    const { totals } = report(D0, D0 + DAY)

    expect(totals.agentWorkMs).toBe(40 * MIN)
    expect(totals.agentWorkEstimatedMs).toBe(0)
  })

  it('measures how long agents worked while the human was away', () => {
    turn('S1', D0 + 10 * HOUR, D0 + 10 * HOUR + 30 * MIN)
    notes.write({
      kind: 'presence',
      entries: Array.from({ length: 10 }, (_, index) => ({
        minute: (D0 + 10 * HOUR) / MIN + 10 + index,
        project: '/p/other',
      })),
    })

    const { totals, workSessions } = report(D0, D0 + DAY)

    expect(totals.agentsWithoutYouMs).toBe(20 * MIN)
    expect(totals.presenceMinutes).toBe(10)
    expect(workSessions).toEqual({ count: 1, longestMinutes: 10, averageMinutes: 10 })
  })

  it('splits by source and project', () => {
    answer(1, D0 + HOUR, 'PANEL', { output: 3 }, '/p/a')
    answer(2, D0 + HOUR, 'CLI', { output: 7 }, '/p/b')
    notes.write({
      kind: 'ideSession',
      provider: 'claude',
      session: 'PANEL',
      ideKind: 'panel',
      at: D0,
    })

    expect(report(D0, D0 + DAY, { source: 'ide', project: null }).totals.tokens.output).toBe(3)
    expect(report(D0, D0 + DAY, { source: 'outside', project: null }).totals.tokens.output).toBe(7)
    expect(report(D0, D0 + DAY, { source: 'all', project: '/p/b' }).totals.tokens.output).toBe(7)
  })
})

describe('buildReport habits and series', () => {
  it('counts streaks from presence and human messages', () => {
    const minuteOf = (day: number) => (D0 + day * DAY + 9 * HOUR) / MIN

    notes.write({
      kind: 'presence',
      entries: [-2, -1].map((day) => ({ minute: minuteOf(day), project: '/p/a' })),
    })
    prompt(1, D0 - 5 * DAY + HOUR, 'S1')

    expect(report(D0, D0 + DAY).streaks).toEqual({ current: 2, best: 2, activeToday: false })
  })

  it('buckets a day by local hours', () => {
    answer(1, D0 + 9 * HOUR + 5 * MIN, 'S1', { output: 4 })
    answer(2, D0 + 9 * HOUR + 50 * MIN, 'S1', { output: 6 })
    turn('S1', D0 + 9 * HOUR + 30 * MIN, D0 + 10 * HOUR + 15 * MIN)

    const { series } = report(D0, D0 + DAY)

    expect(series.bucket).toBe('hour')
    expect(series.points).toHaveLength(24)
    expect(series.points[9]).toMatchObject({ tokens: 10, agentMinutes: 30 })
    expect(series.points[10]).toMatchObject({ tokens: 0, agentMinutes: 15 })
  })
})

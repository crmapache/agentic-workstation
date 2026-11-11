import { rmSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import { StatsService } from './stats-service'
import { inlineEngineLink } from './engine/engine-link'
import { atMs, assistant, humanPrompt } from './transcripts/__fixtures__/transcript-lines'

let root = ''
let service: StatsService | null = null

const day = { from: atMs(-600), to: atMs(840) }

const make = (onChanged = () => undefined, changedThrottleMs = 0) => {
  service = new StatsService({
    dataDir: join(root, 'data'),
    projectsDir: () => Promise.resolve(join(root, 'projects')),
    link: inlineEngineLink,
    onChanged,
    now: () => atMs(120),
    changedThrottleMs,
  })

  return service
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'stats-service-'))

  const project = join(root, 'projects', '-work-app')

  mkdirSync(project, { recursive: true })
  writeFileSync(
    join(project, 'S1.jsonl'),
    [
      humanPrompt({ minute: 0, uuid: 'p1', cwd: '/work/app/src' }, 'go'),
      assistant(
        { minute: 1, uuid: 'a1', cwd: '/work/app/src' },
        { id: 'm1', request: 'r1', usage: { input: 3, output: 4 } },
      ),
    ]
      .map((line) => `${line.toString()}\n`)
      .join(''),
  )
})

afterEach(async () => {
  await service?.close()
  service = null
  rmSync(root, { recursive: true, force: true })
})

describe('StatsService', () => {
  it('scans transcripts and resolves the project of every folder', async () => {
    const stats = make()

    await stats.start((cwd) => (cwd.startsWith('/work/app') ? '/work/app' : null))
    await stats.scanNow()

    const report = await stats.query(day, { source: 'all', project: '/work/app' })

    expect(report.totals.tokens.output).toBe(4)
    expect(report.totals.prompts).toBe(1)
    expect(report.projects.map((row) => row.project)).toEqual(['/work/app'])
    expect(stats.progress).toMatchObject({ running: false, firstPassDone: true })
  })

  it('records live notes and marks the session as started by the IDE', async () => {
    const stats = make()

    await stats.start(() => '/work/app')
    await stats.scanNow()
    stats.noteIdeSession('claude', 'S1', 'panel')
    stats.notePresence([{ minute: atMs(5) / 60_000, project: '/work/app' }])
    stats.noteManual([
      {
        minute: atMs(5) / 60_000,
        project: '/work/app',
        ext: 'ts',
        typed: 12,
        pasted: 30,
        added: 2,
        removed: 1,
      },
    ])
    stats.notePermission({
      provider: 'claude',
      session: 'S1',
      project: '/work/app',
      at: atMs(2),
      decision: 'deny',
    })
    stats.noteScenarioRun({
      runId: 'run-1',
      provider: 'claude',
      project: '/work/app',
      scenario: 'Fix lint',
      startedAt: atMs(10),
      endedAt: atMs(20),
      state: 'done',
      cost: 0.4,
      tokens: 1000,
      activeMs: 600_000,
    })

    await vi.waitFor(async () => {
      const report = await stats.query(day, { source: 'ide', project: null })

      expect(report.totals).toMatchObject({
        presenceMinutes: 1,
        typed: 12,
        pasted: 30,
        manualLinesAdded: 2,
        permissions: { asked: 1, allowed: 0, denied: 1 },
      })
      expect(report.totals.tokens.output).toBe(4)
      expect(report.scenarios).toMatchObject({ runs: 1, doneShare: 1, averageCost: 0.4 })
    })
  })

  it('tells the window about changes no more often than the throttle', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    try {
      const onChanged = vi.fn()
      const stats = make(onChanged, 30_000)

      await stats.start(() => '/work/app')
      await stats.scanNow()

      const before = onChanged.mock.calls.length

      stats.notePresence([{ minute: 1, project: '/work/app' }])
      stats.notePresence([{ minute: 2, project: '/work/app' }])
      await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0))
      expect(onChanged.mock.calls.length).toBe(before)

      vi.advanceTimersByTime(30_000)
      expect(onChanged.mock.calls.length).toBe(before + 1)
    } finally {
      vi.useRealTimers()
    }
  })
})

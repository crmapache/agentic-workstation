import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { RunStep, ScenarioRun } from '@shared/scenario-runs'

import { HEAD_LOG } from './ScenarioStepLog.constants'
import { isLogLive, speakerOf, logSubject } from './ScenarioStepLog.utils'

const t = ((key: string, options: Record<string, unknown> = {}) =>
  key === 'scenarios.run.log.head'
    ? 'Main thread'
    : `Step · ${String(options['title'])}`) as unknown as TFunction

const step = (over: Partial<RunStep>): RunStep =>
  ({
    key: 's:c:1',
    title: 'Fix it',
    startedAt: 0,
    finishedAt: 0,
    rested: 0,
    tokens: 0,
    cost: 0,
    ...over,
  }) as RunStep

const run = (state: ScenarioRun['state'], steps: RunStep[]) => ({ state, steps })

describe('step log', () => {
  it('grows while the run goes: the main thread always, a step only between its start and end', () => {
    const going = step({ startedAt: 10 })
    const done = step({ key: 's:c:2', startedAt: 10, finishedAt: 20 })
    const ahead = step({ key: 's:c:3' })

    expect(isLogLive(run('running', [going]), HEAD_LOG)).toBe(true)
    expect(isLogLive(run('running', [going]), going.key)).toBe(true)
    expect(isLogLive(run('running', [done]), done.key)).toBe(false)
    expect(isLogLive(run('running', [ahead]), ahead.key)).toBe(false)
    expect(isLogLive(run('stopped', [going]), going.key)).toBe(false)
    expect(isLogLive(run('done', []), HEAD_LOG)).toBe(false)
  })

  it('names who writes on the person side', () => {
    expect(speakerOf(HEAD_LOG)).toBe('scenario')
    expect(speakerOf('s:c:1')).toBe('main')
  })

  it('says what is open, with figures only for a finished step', () => {
    const finished = step({ startedAt: 1_000, finishedAt: 2_600, tokens: 4_620, cost: 0.31 })

    expect(logSubject(t, run('running', []), HEAD_LOG)).toBe('Main thread')
    expect(logSubject(t, run('running', [finished]), finished.key)).toBe(
      'Step · Fix it · 1.6s · 4.6k · $0.31',
    )
    expect(logSubject(t, run('running', [step({ startedAt: 10, tokens: 950 })]), 's:c:1')).toBe(
      'Step · Fix it · 950',
    )
  })
})

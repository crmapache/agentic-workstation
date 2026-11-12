import { it, expect, describe } from 'vitest'

import type { RunNote, RunStep, ScenarioRun } from '@shared/scenario-runs'

import {
  cutCardOf,
  runWorked,
  stepWorked,
  timelineOf,
  presentStepKey,
} from './scenarios-timeline.utils'

const step = (key: string, state: RunStep['state'], extra: Partial<RunStep> = {}): RunStep =>
  ({
    key,
    stageId: key.split(':')[0],
    cardId: key.split(':')[1],
    pass: 1,
    title: key,
    state,
    startedAt: 0,
    finishedAt: 0,
    rested: 0,
    ...extra,
  }) as RunStep

const note = (stepKey: string, at: number, who: RunNote['who'] = ''): RunNote => ({
  at,
  stepKey,
  text: `said ${at}`,
  who,
  deliveredAt: 0,
  relayed: '',
})

const run = (steps: RunStep[], notes: RunNote[] = []): ScenarioRun =>
  ({
    snapshot: {
      stages: [
        { id: 'a', title: 'A', repeat: 2, untilDone: true, cards: [] },
        {
          id: 'b',
          title: 'B',
          repeat: 1,
          untilDone: false,
          each: { name: 'item', description: '' },
          cards: [],
        },
      ],
    },
    steps,
    notes,
  }) as unknown as ScenarioRun

describe('timeline', () => {
  it('puts the opening words above everything and each note under its card', () => {
    const rows = timelineOf(
      run(
        [step('a:x:1', 'done'), step('b:y:1', 'waiting')],
        [note('', 1), note('a:x:1', 2), note('b:list', 3)],
      ),
    )

    expect(rows.map((row) => row.kind)).toEqual([
      'note',
      'stage',
      'step',
      'note',
      'stage',
      'note',
      'step',
    ])
  })

  it('says where each stage stands and how long a finished one took', () => {
    const rows = timelineOf(
      run([
        step('a:x:1', 'done', { startedAt: 10, finishedAt: 70, rested: 20 }),
        step('b:y:1', 'running', { startedAt: 80 }),
      ]),
    )
    const stages = rows.flatMap((row) => (row.kind === 'stage' ? [row] : []))

    expect(stages.map((row) => row.standing)).toEqual(['done', 'here'])
    expect(stages[0]?.took).toBe(40)
    expect(stages[1]?.items).toBeNull()
  })

  it('has no chapters when the run has one stage', () => {
    const rows = timelineOf(run([step('a:x:1', 'done'), step('a:x:2', 'running')]))

    expect(rows.map((row) => row.kind)).toEqual(['step', 'step'])
  })

  it('counts work only: no idle gap, no rest, no rest still going', () => {
    const clock = { startedAt: 0, finishedAt: 0, idle: 100, rested: 50, restingSince: 900 }

    expect(runWorked(clock, 1000)).toBe(750)
    expect(
      stepWorked({ startedAt: 500, finishedAt: 0, rested: 0 }, 1000, {
        restingSince: 900,
        finishedAt: 0,
      }),
    ).toBe(400)
  })

  it('finds the card the run stands at', () => {
    const steps = [
      step('a:x:1', 'done', { startedAt: 10, title: 'First' }),
      step('a:x:2', 'running', { startedAt: 20, title: 'Second' }),
      step('b:y:1', 'waiting'),
    ]

    expect(cutCardOf(run(steps))).toBe('Second')
    expect(presentStepKey(run(steps))).toBe('a:x:2')
    expect(presentStepKey(run([step('a:x:1', 'waiting')]))).toBe('')
  })
})

import { it, expect, describe } from 'vitest'

import type { RunStep, ScenarioRun } from '@shared/scenario-runs'
import type { ScenarioStage } from '@shared/scenarios'

import {
  putOff,
  readList,
  afterPass,
  canPutOff,
  expandList,
  followClock,
  plannedStep,
  carryOnPoint,
} from './run-steps'

const step = (key: string, state: RunStep['state'], extra: Partial<RunStep> = {}): RunStep => {
  const [stageId = '', cardId = '', pass = '1'] = key.split(':')

  return { ...plannedStep(key, stageId, cardId, Number(pass), cardId), state, ...extra }
}

const stage: ScenarioStage = {
  id: 's',
  title: 'S',
  repeat: 1,
  untilDone: false,
  each: { name: 'item', description: 'files' },
  cards: [
    {
      id: 'a',
      title: 'A',
      prompt: '[[item]]',
      slots: [],
      dod: '',
      after: '',
      model: '',
      effort: '',
      permissionMode: '',
    },
    {
      id: 'b',
      title: 'B',
      prompt: '[[item]]',
      slots: [],
      dod: '',
      after: '',
      model: '',
      effort: '',
      permissionMode: '',
    },
  ],
}

const run = (steps: RunStep[], extra: Partial<ScenarioRun> = {}) =>
  ({ state: 'stopped', headConversationId: 'h', steps, ...extra }) as ScenarioRun

describe('stage list', () => {
  it('reads objects and bare strings, and refuses an item with nothing to write', () => {
    expect(readList({ items: [{ label: 'One', value: 'a.ts' }, 'b.ts'] })).toEqual({
      kind: 'items',
      items: [
        { label: 'One', value: 'a.ts' },
        { label: 'b.ts', value: 'b.ts' },
      ],
    })
    expect(readList({ items: ['a', { label: 'x' }] })).toEqual({ kind: 'unusable', places: [2] })
    expect(readList({})).toEqual({ kind: 'missing' })
    expect(readList({ items: Array.from({ length: 51 }, (_, at) => `i${at}`) }).kind).toBe(
      'tooLong',
    )
  })

  it('writes the stand-in out as one pass per item, keys running on', () => {
    const steps = [step('s:a:1', 'judging'), step('s:b:1', 'waiting'), step('t:c:1', 'waiting')]
    const expanded = expandList(
      steps,
      stage,
      [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
      5,
    )

    expect(expanded.map((one) => one.key)).toEqual(['s:a:1', 's:b:1', 's:a:2', 's:b:2', 't:c:1'])
    expect(expanded.map((one) => one.item?.value ?? '')).toEqual(['a', 'a', 'b', 'b', ''])
  })

  it('keeps an empty list as a skipped stand-in that says the list was empty', () => {
    const expanded = expandList([step('s:a:1', 'judging'), step('s:b:1', 'waiting')], stage, [], 5)

    expect(expanded.map((one) => [one.state, one.item?.count])).toEqual([
      ['skipped', 0],
      ['skipped', 0],
    ])
  })

  it('puts an item off to the end of its stage, once', () => {
    const item = { label: 'A', value: 'a', index: 1, count: 2, again: '' }
    const steps = [
      step('s:a:1', 'running', { item }),
      step('s:b:1', 'waiting', { item }),
      step('s:a:2', 'waiting', { item: { ...item, index: 2 } }),
      step('t:c:1', 'waiting'),
    ]

    expect(canPutOff(steps[0])).toBe(true)

    const later = putOff(steps, 0, 'service down', 9)

    expect(later.map((one) => one.key)).toEqual([
      's:a:1',
      's:b:1',
      's:a:2',
      's:a:3',
      's:b:3',
      't:c:1',
    ])
    expect(later[1]?.state).toBe('skipped')
    expect(later[3]?.item?.again).toBe('service down')
    expect(canPutOff(later[3])).toBe(false)
    expect(afterPass(later, 0)).toBe(2)
  })
})

describe('carry on', () => {
  it('picks up at the card that was cut short', () => {
    expect(
      carryOnPoint(run([step('a:x:1', 'done'), step('a:y:1', 'failed'), step('a:z:1', 'skipped')])),
    ).toEqual({
      at: 1,
      begun: true,
    })
  })

  it('steps past the last finished card when nothing was cut, past skipped loop passes', () => {
    const steps = [
      step('a:x:1', 'done'),
      step('a:x:2', 'skipped'),
      step('b:y:1', 'done'),
      step('b:z:1', 'skipped'),
    ]

    expect(carryOnPoint(run(steps))).toEqual({ at: 3, begun: false })
  })

  it('refuses a run that finished well, one still going and one whose head never came up', () => {
    expect(carryOnPoint(run([step('a:x:1', 'done')], { state: 'done' }))).toBeNull()
    expect(carryOnPoint(run([step('a:x:1', 'running')], { state: 'running' }))).toBeNull()
    expect(carryOnPoint(run([step('a:x:1', 'failed')], { headConversationId: '' }))).toBeNull()
  })
})

describe('run clock', () => {
  it('counts a rest on the run and on the card that was on the board', () => {
    const base = run([step('a:x:1', 'running')], { rested: 0, restingSince: 0 })
    const resting = followClock(base, true, 0, 100)
    const back = followClock(resting, false, 0, 160)

    expect(resting.restingSince).toBe(100)
    expect(back.rested).toBe(60)
    expect(back.restingSince).toBe(0)
    expect(back.steps[0]?.rested).toBe(60)
  })
})

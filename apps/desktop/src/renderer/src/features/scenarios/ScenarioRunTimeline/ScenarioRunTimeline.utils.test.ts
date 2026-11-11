import { it, expect, describe } from 'vitest'

import { stepLineOf, stepToneOf, filledSlots } from './ScenarioRunTimeline.utils'

describe('stepToneOf', () => {
  it('тон точки - смысл плашки', () => {
    expect(stepToneOf('waiting')).toBe('ahead')
    expect(stepToneOf('skipped')).toBe('ahead')
    expect(stepToneOf('running')).toBe('going')
    expect(stepToneOf('judging')).toBe('going')
    expect(stepToneOf('asking')).toBe('asking')
    expect(stepToneOf('paused')).toBe('paused')
    expect(stepToneOf('done')).toBe('done')
    expect(stepToneOf('failed')).toBe('failed')
  })
})

describe('stepLineOf', () => {
  const step = { said: 'Writing the tests.', summary: 'Fixed both.', prompt: 'Fix it' }

  it('идёт - новейшие слова; кончился - итог; до того - что велели', () => {
    expect(stepLineOf({ ...step, state: 'running' })).toBe('Writing the tests.')
    expect(stepLineOf({ ...step, state: 'done' })).toBe('Fixed both.')
    expect(stepLineOf({ ...step, state: 'running', said: '', summary: '' })).toBe('Fix it')
  })

  it('у строки впереди строки нет', () => {
    expect(stepLineOf({ ...step, state: 'waiting' })).toBe('')
  })
})

describe('filledSlots', () => {
  it('только заполненные слоты', () => {
    expect(filledSlots({ branch: 'main', ticket: '' })).toEqual([['branch', 'main']])
  })
})

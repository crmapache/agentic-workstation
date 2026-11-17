import { it, expect, describe } from 'vitest'

import type { ShelfScenarioWire } from '@agentic-workstation/remote-protocol/wire-types'

import { answersOf, runWorked, stepWorked, inputsReady, scenarioKey } from './scenarios.utils'

const scenario: ShelfScenarioWire = {
  id: 'tidy',
  scope: 'project',
  name: 'Tidy up',
  inputs: [
    { id: 'what', name: 'what', label: 'What', placeholder: '', required: true },
    { id: 'how', name: 'how', label: 'How', placeholder: '', required: false },
  ],
}

describe('сценарий на полке', () => {
  it('обязательные вопросы - отвечены, пробелы не ответ', () => {
    expect(scenarioKey(scenario)).toBe('project:tidy')
    expect(inputsReady(scenario, { what: 'src' })).toBe(true)
    expect(inputsReady(scenario, { what: '   ' })).toBe(false)
  })

  it('ответы - только на свои вопросы, без пробелов по краям', () => {
    expect(answersOf(scenario, { what: ' src ', stray: 'x' })).toEqual({ what: 'src', how: '' })
  })
})

const MINUTE = 60_000

describe('время прогона на телефоне - как в IDE', () => {
  it('идущий: до сейчас, без пауз, промежутков и идущей стоянки', () => {
    const run = { startedAt: 0, finishedAt: 0, idle: MINUTE, rested: 2 * MINUTE, restingSince: 0 }

    expect(runWorked(run, 10 * MINUTE)).toBe(7 * MINUTE)
    expect(runWorked({ ...run, restingSince: 9 * MINUTE }, 10 * MINUTE)).toBe(6 * MINUTE)
  })

  it('кончился: до конца, а не до сейчас', () => {
    expect(runWorked({ startedAt: 0, finishedAt: 5 * MINUTE }, 60 * MINUTE)).toBe(5 * MINUTE)
  })

  it('IDE без учёта пауз - без вычетов', () => {
    expect(runWorked({ startedAt: MINUTE, finishedAt: 0 }, 4 * MINUTE)).toBe(3 * MINUTE)
  })

  it('шаг: не начат - ноль; идёт - без своей стоянки и стоянки прогона', () => {
    const run = { finishedAt: 0, restingSince: 8 * MINUTE }

    expect(stepWorked({ startedAt: 0, finishedAt: 0 }, 10 * MINUTE, run)).toBe(0)
    expect(
      stepWorked({ startedAt: 2 * MINUTE, finishedAt: 0, rested: MINUTE }, 10 * MINUTE, run),
    ).toBe(5 * MINUTE)
    expect(stepWorked({ startedAt: 2 * MINUTE, finishedAt: 4 * MINUTE }, 10 * MINUTE, run)).toBe(
      2 * MINUTE,
    )
  })
})

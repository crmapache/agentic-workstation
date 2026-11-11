import { it, expect, describe } from 'vitest'

import type { ShelfScenarioWire } from '@agentic-workstation/remote-protocol/wire-types'

import { answersOf, inputsReady, scenarioKey } from './scenarios.utils'

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

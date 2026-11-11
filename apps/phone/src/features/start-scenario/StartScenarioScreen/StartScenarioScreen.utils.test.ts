import { it, expect, describe } from 'vitest'

import type { ShelfScenarioWire } from '@agentic-workstation/remote-protocol/wire-types'

import type { StartForm } from './StartScenarioScreen.types'
import { startArgs } from './StartScenarioScreen.utils'

const scenario: ShelfScenarioWire = {
  id: 'tidy',
  scope: 'project',
  name: 'Tidy up',
  inputs: [
    { id: 'what', name: 'what', label: 'What', placeholder: '', required: true },
    { id: 'how', name: 'how', label: 'How', placeholder: '', required: false },
  ],
}

const form: StartForm = {
  scenario: 'project:tidy',
  inputs: { what: ' src ', stray: 'x' },
  target: { kind: 'new' },
  worktree: true,
  afterSuccess: true,
  provider: 'claude',
}

describe('запуск сценария с телефона', () => {
  it('новая очередь: worktree по галочке, «только после успеха» не к месту', () => {
    expect(startArgs('p-x', scenario, form)).toEqual({
      projectKey: 'p-x',
      scenarioId: 'tidy',
      scope: 'project',
      inputs: { what: 'src', how: '' },
      provider: 'claude',
      target: { kind: 'new', worktree: true },
      afterSuccess: false,
    })
  })

  it('существующая очередь - по id, с «только после успеха»', () => {
    expect(
      startArgs('p-x', scenario, { ...form, target: { kind: 'queue', queueId: 'q1' } }),
    ).toMatchObject({
      target: { kind: 'queue', queueId: 'q1' },
      afterSuccess: true,
    })
  })
})

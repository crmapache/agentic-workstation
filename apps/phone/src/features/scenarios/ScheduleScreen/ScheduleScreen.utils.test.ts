import { it, expect, describe } from 'vitest'

import type { ShelfScenarioWire } from '@agentic-workstation/remote-protocol/wire-types'

import { DEFAULT_SCHEDULE } from './ScheduleScreen.constants'
import { scheduleArgs } from './ScheduleScreen.utils'

const scenario: ShelfScenarioWire = {
  id: 'tidy',
  scope: 'user',
  name: 'Tidy up',
  inputs: [{ id: 'what', name: 'what', label: 'What', placeholder: '', required: true }],
}

describe('отложенный запуск с телефона', () => {
  it('новый: час минутами от полуночи, ответы - только на свои вопросы', () => {
    expect(
      scheduleArgs('p-x', scenario, {
        ...DEFAULT_SCHEDULE,
        time: '07:30',
        repeat: 'weekly',
        weekday: 5,
        inputs: { what: ' src ', stray: 'x' },
        provider: 'claude',
      }),
    ).toEqual({
      projectKey: 'p-x',
      scenarioId: 'tidy',
      scope: 'user',
      scheduleId: '',
      at: 450,
      repeat: 'weekly',
      weekday: 5,
      inputs: { what: 'src' },
      worktree: true,
      provider: 'claude',
    })
  })

  it('без часа или провайдера - не отправляется', () => {
    expect(scheduleArgs('p-x', scenario, { ...DEFAULT_SCHEDULE, time: '', provider: 'c' })).toBe(
      null,
    )
    expect(scheduleArgs('p-x', scenario, DEFAULT_SCHEDULE)).toBeNull()
  })
})

import { it, expect, describe } from 'vitest'

import type { RunsOn } from '@shared/scenario-queues'
import type { Scenario, ScenarioCard } from '@shared/scenarios'

import { runsOnOf } from './runs-on'

const card = (id: string, model = '', effort = ''): ScenarioCard => ({
  id,
  title: id,
  prompt: 'do it',
  slots: [],
  dod: '',
  after: '',
  model,
  effort,
  permissionMode: '',
})

const scenarioOf = (head: RunsOn, ...cards: ScenarioCard[]): Scenario => ({
  version: 1,
  id: 's',
  name: 'S',
  createdAt: 0,
  updatedAt: 0,
  inputs: [],
  head: {
    briefing: '',
    provider: 'claude',
    ...head,
    permissionMode: 'default',
    onQuestion: 'head',
    retries: 1,
    onGiveUp: 'stop',
  },
  stages: [{ id: 'st', title: 'Stage', repeat: 1, untilDone: false, cards }],
  scope: 'project',
})

const provider = (defaults: RunsOn, fitRunsOn?: (choice: RunsOn) => RunsOn) => ({
  defaults: () => defaults,
  fitRunsOn,
})

describe('what a scenario runs on', () => {
  it('gives a card the main thread values it leaves empty, and lists each pair once', () => {
    const scenario = scenarioOf(
      { model: 'opus[1m]', effort: 'max' },
      card('intake'),
      card('review', '', 'xhigh'),
      card('pr', 'sonnet', 'medium'),
    )

    expect(runsOnOf(scenario, provider({ model: 'haiku', effort: 'low' }))).toEqual([
      { model: 'opus[1m]', effort: 'max' },
      { model: 'opus[1m]', effort: 'xhigh' },
      { model: 'sonnet', effort: 'medium' },
    ])
  })

  it('takes what a new tab runs on where the scenario says nothing', () => {
    const scenario = scenarioOf({ model: '', effort: '' }, card('a'))

    expect(runsOnOf(scenario, provider({ model: 'sonnet', effort: 'high' }))).toEqual([
      { model: 'sonnet', effort: 'high' },
    ])
    expect(runsOnOf(scenario, null)).toEqual([{ model: '', effort: '' }])
  })

  it('shows what the provider really starts: its own model for a model it does not know', () => {
    const scenario = scenarioOf({ model: 'gpt-5.5', effort: 'high' }, card('a', 'opus'))
    const claude = provider({ model: '', effort: '' }, (choice) => ({
      ...choice,
      model: choice.model.startsWith('gpt') ? '' : choice.model,
    }))

    expect(runsOnOf(scenario, claude)).toEqual([
      { model: '', effort: 'high' },
      { model: 'opus', effort: 'high' },
    ])
  })
})

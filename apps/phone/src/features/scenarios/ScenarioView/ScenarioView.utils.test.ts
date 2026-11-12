import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { ScenarioStageWire } from '@agentic-workstation/remote-protocol/scenario-wire-types'

import { runFacts, headRules, stageRepeat } from './ScenarioView.utils'

const t = ((key: string, values: Record<string, unknown> = {}) =>
  `${key}${JSON.stringify(values)}`) as unknown as TFunction

const stage = (patch: Partial<ScenarioStageWire>): ScenarioStageWire => ({
  id: 's',
  title: 'Build',
  repeat: 1,
  untilDone: false,
  each: null,
  cards: [],
  ...patch,
})

describe('сценарий на чтение', () => {
  it('модель, усилие и режим - без пустых', () => {
    expect(runFacts(t, { model: 'opus', effort: '', permissionMode: '' })).toBe('opus')
    expect(runFacts(t, { model: '', effort: '', permissionMode: '' })).toBe('')
    expect(runFacts(t, { model: '', effort: 'high', permissionMode: 'plan' })).toContain(' · ')
  })

  it('повтор этапа: по пункту, до готовности, N раз, обычный - пусто', () => {
    expect(stageRepeat(t, stage({}))).toBe('')
    expect(stageRepeat(t, stage({ repeat: 3 }))).toBe('scenario.stage.repeat{"count":3}')
    expect(stageRepeat(t, stage({ untilDone: true, repeat: 5 }))).toContain('untilDone')
    expect(stageRepeat(t, stage({ each: { name: 'file', description: '' } }))).toContain('each')
  })

  it('правила головы: вопрос и возвраты', () => {
    const head = {
      briefing: '',
      model: '',
      effort: '',
      permissionMode: '',
      onQuestion: 'stop',
      retries: 0,
      onGiveUp: '',
    }

    expect(headRules(t, head)).toBe('scenario.head.onQuestion.stop{"defaultValue":"stop"}')
    expect(headRules(t, { ...head, retries: 2 })).toContain('scenario.head.retries')
  })
})

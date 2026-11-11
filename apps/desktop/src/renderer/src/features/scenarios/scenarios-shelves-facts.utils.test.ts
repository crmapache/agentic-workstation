import { it, expect, describe } from 'vitest'

import type { Scenario, ScenarioStage, ScenarioSchedule } from '@shared/scenarios'

import { factsOf, hoursNote, comingHours } from './scenarios-shelves-facts.utils'

const card = (id: string, prompt: string) => ({
  id,
  title: id,
  prompt,
  slots: [],
  dod: '',
  after: '',
  model: '',
  effort: '',
  permissionMode: '',
})

const stage = (id: string, extra: Partial<ScenarioStage> = {}): ScenarioStage => ({
  id,
  title: id,
  repeat: 1,
  untilDone: false,
  cards: [card(`${id}-1`, 'do it'), card(`${id}-2`, 'check it')],
  ...extra,
})

const scenario = (stages: ScenarioStage[], inputs: string[] = []): Scenario => ({
  version: 1,
  id: 's',
  name: 'Review',
  createdAt: 0,
  updatedAt: 0,
  inputs: inputs.map((name) => ({ id: name, name, label: name, placeholder: '', required: false })),
  head: {
    briefing: '',
    model: '',
    effort: '',
    permissionMode: '',
    onQuestion: 'head',
    retries: 2,
    onGiveUp: 'stop',
  },
  stages,
  scope: 'project',
})

const hour = (nextAt: number, missedAt = 0): ScenarioSchedule => ({
  id: `h${nextAt}-${missedAt}`,
  scenarioId: 's',
  scope: 'project',
  at: 0,
  repeat: 'daily',
  weekday: 1,
  inputs: {},
  nextAt,
  lastAt: 0,
  missedAt,
  worktree: false,
  provider: 'claude',
})

describe('факты строки сценария', () => {
  it('этапы, карточки с проходами, цикл и вопросы', () => {
    const facts = factsOf(
      scenario(
        [stage('a', { repeat: 3 }), stage('b', { each: { name: 'item', description: 'files' } })],
        ['ticket', 'branch'],
      ),
    )

    expect(facts).toMatchObject({
      broken: false,
      stages: 2,
      cards: 8,
      hasLoop: true,
      perItem: true,
      asks: ['ticket', 'branch'],
    })
  })

  it('этап «по пункту» - свой чип, а не цикл', () => {
    const each = stage('b', {
      repeat: 4,
      each: { name: 'item', description: 'files' },
      cards: [card('b-1', 'look at [[item]]')],
    })
    const facts = factsOf(scenario([each]))

    expect(facts.perItem).toBe(true)
    expect(facts.hasLoop).toBe(false)
  })

  it('сценарий без этапов сломан, и беда посчитана', () => {
    expect(factsOf(scenario([]))).toMatchObject({ broken: true, problems: 1 })
  })
})

describe('часы на строке', () => {
  it('часов нет - и сказать нечего', () => {
    expect(hoursNote([])).toBeNull()
  })

  it('пропуск берётся только у часов, у которых впереди есть срок', () => {
    // Разовый пропущенный и ежедневный, у которого всё в порядке, - пропуска нет.
    expect(hoursNote([hour(0, 50), hour(300)])).toEqual({ count: 2, next: 300, missed: null })
    expect(hoursNote([hour(200, 40), hour(300)])).toEqual({ count: 2, next: 200, missed: 40 })
  })

  it('впереди ничего - пропуск единственное, что осталось сказать', () => {
    expect(hoursNote([hour(0, 50), hour(0, 70)])).toEqual({ count: 2, next: null, missed: 70 })
  })

  it('два ближайших срока по порядку', () => {
    expect(comingHours([hour(900), hour(0, 5), hour(300), hour(600)])).toEqual([300, 600])
  })
})

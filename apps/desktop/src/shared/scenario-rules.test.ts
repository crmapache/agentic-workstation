import { it, expect, describe } from 'vitest'

import {
  planOf,
  cardRuns,
  passesOf,
  answersOf,
  fillSlots,
  fillInputs,
  isBlocking,
  isRunnable,
  problemsOf,
  answerLabel,
  slotsToFill,
  declaredSlots,
  missingInputs,
  mentionedSlots,
  mentionedInputs,
} from './scenario-rules'
import type { Scenario, ScenarioCard, ScenarioStage } from './scenarios'

const card = (id: string, prompt: string, slots: string[] = []): ScenarioCard => ({
  id,
  title: '',
  prompt,
  slots: slots.map((name) => ({ id: name, name, description: '' })),
  dod: '',
  after: '',
  model: '',
  effort: '',
  permissionMode: '',
})

const stage = (
  id: string,
  cards: ScenarioCard[],
  extra: Partial<ScenarioStage> = {},
): ScenarioStage => ({
  id,
  title: id,
  repeat: 1,
  untilDone: false,
  cards,
  ...extra,
})

const scenario = (stages: ScenarioStage[], inputs: string[] = []): Scenario => ({
  version: 1,
  id: 's',
  name: 'S',
  createdAt: 0,
  updatedAt: 0,
  inputs: inputs.map((name) => ({
    id: name,
    name,
    label: name,
    placeholder: '',
    required: name === 'branch',
  })),
  head: {
    briefing: '',
    model: '',
    effort: '',
    permissionMode: 'default',
    onQuestion: 'head',
    retries: 2,
    onGiveUp: 'stop',
  },
  stages,
  scope: 'project',
})

describe('scenario rules', () => {
  it('reads the two kinds of placeholder apart', () => {
    const text = 'Review {{branch}} and write to [[findings]], then {{branch}} again'

    expect(mentionedInputs(text)).toEqual(['branch'])
    expect(mentionedSlots(text)).toEqual(['findings'])
    expect(fillSlots(fillInputs(text, { branch: 'x' }), { findings: 'f.md' })).toBe(
      'Review x and write to f.md, then x again',
    )
  })

  it('leaves an unanswered name standing', () => {
    expect(fillInputs('see {{ticket}}', {})).toBe('see {{ticket}}')
  })

  it('counts a slot used but never declared as one the head must fill', () => {
    expect(declaredSlots(card('a', 'use [[stray]]')).map((slot) => slot.name)).toEqual(['stray'])
  })

  it('does not ask the main thread for the item of a stage that runs per item', () => {
    const listed = stage('st', [card('a', 'fix [[item]] with [[hint]]', ['hint'])], {
      each: { name: 'item', description: 'files' },
    })

    expect(slotsToFill(listed, listed.cards[0] as ScenarioCard).map((slot) => slot.name)).toEqual([
      'hint',
    ])
  })

  it('blocks a run on an undeclared slot and not on an unused one', () => {
    const undeclared = scenario([stage('st', [card('a', 'use [[x]]')])])
    const unused = scenario([stage('st', [card('a', 'plain', ['x'])])])

    expect(isRunnable(undeclared)).toBe(false)
    expect(isRunnable(unused)).toBe(true)
    expect(problemsOf(unused).map((problem) => problem.kind)).toEqual(['unusedSlot'])
    expect(problemsOf(unused).some(isBlocking)).toBe(false)
  })

  it('sees a name the scenario never asked for, an empty scenario and an empty stage', () => {
    expect(
      problemsOf(scenario([stage('st', [card('a', '{{nope}}')])])).map((one) => one.kind),
    ).toEqual(['unknownInput'])
    expect(problemsOf(scenario([])).map((one) => one.kind)).toEqual(['noStages'])
    expect(problemsOf(scenario([stage('st', [])])).map((one) => one.kind)).toEqual(['emptyStage'])
  })

  it('says what a list stage lacks and refuses a slot under the item’s name', () => {
    const listed = stage('st', [card('a', 'plain', ['item'])], {
      each: { name: 'item', description: '' },
    })
    const kinds = problemsOf(scenario([listed])).map((one) => one.kind)

    expect(kinds).toContain('noItemList')
    expect(kinds).toContain('unusedItem')
    expect(kinds).toContain('itemSlotClash')
  })

  it('counts only required answers left empty as missing, and fills every declared name', () => {
    const asked = scenario([stage('st', [card('a', '{{branch}} {{notes}}')])], ['branch', 'notes'])

    expect(missingInputs(asked, { notes: 'x' })).toEqual(['branch'])
    expect(answersOf(asked, { notes: 'n', branch: 'b', extra: 'e' })).toEqual({
      branch: 'b',
      notes: 'n',
      extra: 'e',
    })
    expect(Object.keys(answersOf(asked, {}))).toEqual(['branch', 'notes'])
  })

  it('writes a loop out flat, a list stage as one pass, and clamps a pass count', () => {
    const looped = scenario([
      stage('a', [card('x', 'p'), card('y', 'p')], { repeat: 3 }),
      stage('b', [card('z', 'p [[item]]')], {
        each: { name: 'item', description: 'd' },
        repeat: 7,
      }),
    ])

    expect(planOf(looped).map((step) => step.key)).toEqual([
      'a:x:1',
      'a:y:1',
      'a:x:2',
      'a:y:2',
      'a:x:3',
      'a:y:3',
      'b:z:1',
    ])
    expect(cardRuns(looped)).toBe(7)
    expect(passesOf(stage('c', [], { repeat: 99 }))).toBe(10)
    expect(passesOf(stage('c', [], { repeat: 0 }))).toBe(1)
  })

  it('labels a run by the tail of a link and the first line of an answer', () => {
    expect(answerLabel({ a: 'https://github.com/x/y/pull/45' })).toBe('pull/45')
    expect(answerLabel({ a: 'https://www.notion.so/' })).toBe('notion.so')
    expect(answerLabel({ a: '', b: 'first line\nsecond' })).toBe('first line')
  })
})

import { it, expect, describe } from 'vitest'

import { problemsOf } from '@shared/scenario-rules'
import type { Scenario, ScenarioCard, ScenarioStage } from '@shared/scenarios'

import { blankScenario } from './scenarios-blank.utils'
import {
  isDirty,
  shifted,
  livePlace,
  movedCard,
  runsTimes,
  withStage,
  movedStage,
  runsPerItem,
  withoutCard,
  promptPieces,
  placeOfProblem,
  withCopiedCard,
} from './scenarios-editor.utils'

const card = (id: string, prompt = 'Do it'): ScenarioCard => ({
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

const stage = (id: string, cards: ScenarioCard[]): ScenarioStage => ({
  id,
  title: id,
  repeat: 1,
  untilDone: false,
  cards,
})

const scenario = (stages: ScenarioStage[]): Scenario => ({
  version: 1,
  id: 'review',
  name: 'Review',
  createdAt: 0,
  updatedAt: 0,
  inputs: [],
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

describe('перестановки', () => {
  it('сдвиг внутри списка и за край', () => {
    expect(shifted(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    expect(shifted(['a', 'b', 'c'], 2, -2)).toEqual(['c', 'a', 'b'])
    expect(shifted(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(shifted(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
    expect(shifted(['a'], -1, 1)).toEqual(['a'])
  })

  it('этап и карточка двигаются по id, соседи остаются теми же объектами', () => {
    const first = stage('one', [card('a'), card('b')])
    const second = stage('two', [card('c')])
    const draft = scenario([first, second])

    expect(movedStage(draft, 'two', -1).stages.map((one) => one.id)).toEqual(['two', 'one'])
    expect(movedCard(first, 'a', 1).cards.map((one) => one.id)).toEqual(['b', 'a'])
    expect(withStage(draft, 'one', (one) => ({ ...one, title: 'x' })).stages[1]).toBe(second)
  })

  it('копия карточки - сразу под ней и со своим id, слоты не общие', () => {
    const original = { ...card('a'), slots: [{ id: 's', name: 'found', description: '' }] }
    const copied = withCopiedCard(stage('one', [original, card('b')]), 'a', 'copy')

    expect(copied.cards.map((one) => one.id)).toEqual(['a', 'copy', 'b'])
    expect(copied.cards[1]?.slots).toEqual(original.slots)
    expect(copied.cards[1]?.slots[0]).not.toBe(original.slots[0])
  })

  it('удалённая карточка уходит только из своего этапа', () => {
    expect(withoutCard(stage('one', [card('a'), card('b')]), 'a').cards).toEqual([card('b')])
  })
})

describe('RUNS', () => {
  it('«по пункту» - один проход без «пока не готово», заданный список не затирается', () => {
    const looping = { ...stage('one', []), repeat: 3, untilDone: true }
    const blank = { name: 'item', description: '' }

    expect(runsPerItem(looping, blank)).toMatchObject({ repeat: 1, untilDone: false, each: blank })

    const listed = { ...looping, each: { name: 'ticket', description: 'Tickets' } }

    expect(runsPerItem(listed, blank).each).toEqual({ name: 'ticket', description: 'Tickets' })
  })

  it('число снимает список', () => {
    const listed = { ...stage('one', []), each: { name: 'ticket', description: '' } }

    expect(runsTimes(listed, 4)).toMatchObject({ repeat: 4, each: null })
  })
})

describe('место в редакторе', () => {
  it('находка ведёт к карточке, этапу, вопросам или в начало', () => {
    const draft = {
      ...scenario([stage('one', [card('a', 'Use {{ticket}} and [[found]]')]), stage('two', [])]),
      inputs: [{ id: 'i', name: 'bad name', label: '', placeholder: '', required: false }],
    }
    const places = problemsOf(draft).map((problem) => [
      problem.kind,
      placeOfProblem(draft, problem),
    ])

    expect(places).toEqual([
      ['badInputName', { part: 'inputs' }],
      ['unknownInput', { part: 'stage', stageId: 'one', cardId: 'a' }],
      ['undeclaredSlot', { part: 'stage', stageId: 'one', cardId: 'a' }],
      ['emptyStage', { part: 'stage', stageId: 'two', cardId: undefined }],
    ])
    expect(placeOfProblem(scenario([]), { kind: 'noStages' })).toEqual({ part: 'name' })
  })

  it('место без этапа - к началу, без карточки - к её этапу', () => {
    const draft = scenario([stage('one', [card('a')])])

    expect(livePlace(draft, { part: 'stage', stageId: 'gone' })).toEqual({ part: 'name' })
    expect(livePlace(draft, { part: 'stage', stageId: 'one', cardId: 'gone' })).toEqual({
      part: 'stage',
      stageId: 'one',
    })

    const kept = { part: 'stage', stageId: 'one', cardId: 'a' } as const

    expect(livePlace(draft, kept)).toBe(kept)
    expect(livePlace(draft, { part: 'head' })).toEqual({ part: 'head' })
  })
})

describe('подсветка промпта', () => {
  it('вопросы и слоты отдельно, текст как набран, пробелы внутри скобок - тоже имя', () => {
    expect(promptPieces('Review {{branch}}, write [[ found ]].\n')).toEqual([
      { text: 'Review ', kind: 'text' },
      { text: '{{branch}}', kind: 'input' },
      { text: ', write ', kind: 'text' },
      { text: '[[ found ]]', kind: 'slot' },
      { text: '.\n', kind: 'text' },
    ])
  })

  it('не имя - просто текст', () => {
    expect(promptPieces('{{a b}} [[]] {x}')).toEqual([{ text: '{{a b}} [[]] {x}', kind: 'text' }])
    expect(promptPieces('')).toEqual([])
  })
})

describe('есть ли что терять', () => {
  it('новый без единого слова - нечего, с именем или промптом - есть', () => {
    const blank = blankScenario('', 'Stage 1', 'user')

    expect(isDirty(blank, [])).toBe(false)
    expect(isDirty({ ...blank, name: 'Review' }, [])).toBe(true)
    expect(isDirty(scenario([stage('one', [card('a', 'Do it')])]), [])).toBe(true)
  })

  it('сохранённый - сравнение с полкой, и с той, куда файл ещё не переехал', () => {
    const saved = scenario([stage('one', [card('a')])])

    expect(isDirty(saved, [saved])).toBe(false)
    expect(isDirty({ ...saved, name: 'Other' }, [saved])).toBe(true)
    expect(isDirty({ ...saved, scope: 'user' }, [saved])).toBe(true)
  })
})

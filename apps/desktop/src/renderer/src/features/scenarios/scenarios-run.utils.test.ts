import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { RunMove, RunStep, ScenarioRun } from '@shared/scenario-runs'
import type { Scenario } from '@shared/scenarios'

import en from '../../locales/en.json'
import { formatCost, formatTokens, formatDuration } from './scenarios-format.utils'
import {
  endWords,
  limitName,
  moveWords,
  stepFacts,
  detailText,
  endDetails,
  lastToldAt,
  limitWords,
  itemLabelOf,
  stageSizeWords,
  stepPlaceWords,
  stageVerdictWords,
} from './scenarios-run.utils'

/** Настоящие строки en.json с подстановкой и множественным числом - проверка читается как экран. */
const t = ((key: string, options: Record<string, unknown> = {}) => {
  const parts = key.split('.')
  const last = parts.pop() ?? ''
  const parent = parts.reduce<Record<string, unknown>>(
    (node, part) => node[part] as Record<string, unknown>,
    en as unknown as Record<string, unknown>,
  )
  const plural = `${last}_${options['count'] === 1 ? 'one' : 'other'}`
  const found = parent[last] ?? parent[plural]

  return String(found).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name]))
}) as unknown as TFunction

const step = (over: Partial<RunStep> = {}): RunStep => ({
  key: 's:c:1',
  cardId: 'c',
  stageId: 's',
  pass: 1,
  title: 'Collect the diff',
  state: 'waiting',
  conversationId: '',
  startedAt: 0,
  finishedAt: 0,
  slots: {},
  prompt: '',
  said: '',
  summary: '',
  nudges: [],
  verdict: '',
  verdictReason: '',
  handoff: '',
  failure: '',
  error: '',
  cost: 0,
  tokens: 0,
  takeOver: '',
  rested: 0,
  ...over,
})

const run = (over: Partial<ScenarioRun> = {}): ScenarioRun => ({
  id: 'run-1',
  projectPath: '/work/app',
  cwd: '/work/app',
  provider: 'claude',
  queueId: 'q',
  itemId: 'i',
  scenarioId: 'review',
  scenarioName: 'Review and fix',
  scope: 'project',
  snapshot: {} as Scenario,
  startedAt: 1_000,
  finishedAt: 0,
  state: 'running',
  runFrom: '',
  inputs: {},
  total: 0,
  headConversationId: 'head',
  steps: [],
  notes: [],
  question: null,
  failure: '',
  error: '',
  cost: 0,
  tokens: 0,
  idle: 0,
  rested: 0,
  restingSince: 0,
  writtenAt: 0,
  starred: false,
  answering: false,
  limit: null,
  ...over,
})

const item = (over: Partial<NonNullable<RunStep['item']>> = {}) => ({
  label: 'totals.ts',
  value: 'src/totals.ts',
  index: 3,
  count: 7,
  again: '',
  ...over,
})

describe('цифры прогона', () => {
  it('длительность: доли секунды, секунды, минуты, часы', () => {
    expect(formatDuration(400)).toBe('0.4s')
    expect(formatDuration(12_000)).toBe('12s')
    expect(formatDuration(59_600)).toBe('1m 00s')
    expect(formatDuration(185_000)).toBe('3m 05s')
    expect(formatDuration(3_725_000)).toBe('1h 02m 05s')
    expect(formatDuration(-5)).toBe('0.0s')
  })

  it('токены и деньги коротко', () => {
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(12_400)).toBe('12k')
    expect(formatTokens(4_620)).toBe('4.6k')
    expect(formatTokens(1_200_000)).toBe('1.2M')
    expect(formatCost(2.5)).toBe('$2.50')
    expect(formatCost(0.31)).toBe('$0.31')
    expect(formatCost(0.042)).toBe('$0.042')
  })
})

describe('stepPlaceWords', () => {
  const once = { passes: 1, untilDone: false, perItem: false }

  it('этап, что идёт один раз, места не называет', () => {
    expect(stepPlaceWords(t, step(), once)).toBe('')
  })

  it('проходы: счёт или потолок', () => {
    expect(stepPlaceWords(t, step({ pass: 2 }), { ...once, passes: 3 })).toBe('pass 2 of 3')
    expect(stepPlaceWords(t, step({ pass: 1 }), { ...once, passes: 3, untilDone: true })).toBe(
      'pass 1 of up to 3',
    )
  })

  it('этап по списку: пункт, второй заход, нет списка, пустой список', () => {
    const perItem = { ...once, perItem: true }

    expect(stepPlaceWords(t, step({ item: item() }), perItem)).toBe('item 3 of 7')
    expect(stepPlaceWords(t, step({ item: item({ again: 'flaky' }) }), perItem)).toBe('second go')
    expect(stepPlaceWords(t, step(), perItem)).toBe('waiting for the list')
    expect(stepPlaceWords(t, step({ item: item({ count: 0 }) }), perItem)).toBe(
      'nothing on the list',
    )
  })
})

describe('stageSizeWords и stageVerdictWords', () => {
  it('размер этапа: проходы, длина списка, нет списка', () => {
    expect(stageSizeWords(t, { passes: 1, untilDone: false })).toBe('')
    expect(stageSizeWords(t, { passes: 3, untilDone: true })).toBe('×3, until done')
    expect(stageSizeWords(t, { passes: 2, untilDone: false })).toBe('×2')
    expect(stageSizeWords(t, { passes: 1, untilDone: false, items: 7 })).toBe('7 items')
    expect(stageSizeWords(t, { passes: 1, untilDone: false, items: 1 })).toBe('1 item')
    expect(stageSizeWords(t, { passes: 1, untilDone: false, items: null })).toBe(
      'list not given yet',
    )
  })

  it('вердикт этапа: где прогон относительно него', () => {
    const stage = { passes: 3, untilDone: true, standing: 'ahead' as const, took: 0 }

    expect(stageVerdictWords(t, stage)).toBe('×3, until done · not reached')
    expect(stageVerdictWords(t, { ...stage, passes: 1, standing: 'here' })).toBe('here now')
    expect(stageVerdictWords(t, { ...stage, passes: 1, standing: 'done', took: 1_600 })).toBe(
      'done · 1.6s',
    )
  })

  it('пустой список сам говорит, чем кончилось, - без «done · 0s»', () => {
    expect(
      stageVerdictWords(t, { passes: 1, untilDone: false, items: 0, standing: 'done', took: 0 }),
    ).toBe('empty list')
  })
})

describe('itemLabelOf', () => {
  it('пункт - только у строки по пункту и непустого списка', () => {
    expect(itemLabelOf(step({ item: item() }))).toBe('totals.ts')
    expect(itemLabelOf(step({ item: item({ count: 0 }) }))).toBe('')
    expect(itemLabelOf(step())).toBe('')
  })
})

describe('слова IDE об аккаунте', () => {
  const move = (over: Partial<RunMove>): RunMove => ({
    reason: 'limit',
    from: 'work@example.com',
    to: 'home@example.com',
    waits: false,
    window: 'five_hour',
    until: 0,
    ...over,
  })

  it('окно лимита по имени CLI; незнакомое - общий лимит', () => {
    expect(limitName(t, 'five_hour')).toBe('The 5-hour limit')
    expect(limitName(t, 'something_new')).toBe('The usage limit')
  })

  it('переезд по выбору, по лимиту и с аккаунта, который не смог', () => {
    expect(moveWords(t, move({ reason: 'choice' }))).toBe(
      'Moved the run to home@example.com - the account you chose.',
    )
    expect(moveWords(t, move({}))).toBe(
      'The 5-hour limit of work@example.com ran out. Moved the run to home@example.com.',
    )
    expect(moveWords(t, move({ reason: 'unfit', from: '' }))).toBe(
      'Claude Code sign-in could not take the run. Moved the run to home@example.com.',
    )
  })

  it('ожидание говорит, когда прогон пойдёт сам, - если знает', () => {
    expect(moveWords(t, move({ waits: true, window: '' }))).toBe(
      'The usage limit of work@example.com ran out, and no other account has room. The run waits.',
    )
    expect(
      moveWords(t, move({ waits: true, until: new Date(2026, 9, 19, 22, 5).getTime() })),
    ).toMatch(/The run waits\. It goes on by itself at 10:05\sPM\.$/)
  })

  it('строка LIMIT: чей лимит и когда пойдёт сам', () => {
    const until = new Date(2026, 9, 19, 7, 30).getTime()

    expect(
      limitWords(t, { account: 'work@example.com', window: 'seven_day', until, reason: 'limit' }),
    ).toMatch(
      /^The weekly limit of work@example\.com ran out - the run goes on by itself at 7:30\sAM$/,
    )
    expect(limitWords(t, { account: '', window: '', until, reason: 'unfit' })).toMatch(
      /^Claude Code sign-in could not take the run/,
    )
  })
})

describe('итог прогона', () => {
  const begun = step({ title: 'Fix it', startedAt: 5_000 })

  it('называет карточку, на которой встал', () => {
    expect(endWords(t, run({ state: 'done' }))).toBe('Every card is done.')
    expect(endWords(t, run({ state: 'stopped', steps: [begun] }))).toBe(
      'You stopped it at Fix it. Nothing after that card was started.',
    )
    expect(endWords(t, run({ state: 'stopped' }))).toBe(
      'You stopped it before the first card began.',
    )
    expect(endWords(t, run({ state: 'failed', steps: [begun, step()] }))).toBe(
      'It stopped on a failure at Fix it.',
    )
  })

  it('поломка словами, ошибка - если слова её не несут', () => {
    expect(endDetails(t, run({ failure: 'noHead', error: 'spawn ENOENT' }))).toEqual([
      'The main thread could not start: spawn ENOENT',
    ])
    expect(endDetails(t, run({ failure: 'undone', error: 'Fix it: tests are red' }))).toEqual([
      'The main thread judged a card not done.',
      'Fix it: tests are red',
    ])
    expect(endDetails(t, run({ failure: 'stopped' }))).toEqual([])
  })
})

describe('мелочи окна прогона', () => {
  it('показания шага: только то, что есть', () => {
    expect(stepFacts(1_600, 46_200, 0.31)).toBe('1.6s · 46k · $0.31')
    expect(stepFacts(0, 4_620, 0)).toBe('4.6k')
  })

  it('аргументы разрешения: целый JSON - с отступами, обрезанный - как есть', () => {
    expect(detailText('{"command":"ls"}')).toBe('{\n  "command": "ls"\n}')
    expect(detailText('{"command":"ls -la …')).toBe('{"command":"ls -la …')
  })

  it('последние слова человека - по штампу, слова головы не считаются', () => {
    const note = { stepKey: '', text: '', deliveredAt: 0, relayed: '' }

    expect(
      lastToldAt([
        { ...note, at: 5, who: 'person' },
        { ...note, at: 9, who: '' },
        { ...note, at: 7, who: 'person' },
      ]),
    ).toBe(7)
  })
})

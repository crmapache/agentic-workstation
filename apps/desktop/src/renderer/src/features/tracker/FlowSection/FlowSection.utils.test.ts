import { it, expect, describe } from 'vitest'

import type { TrackerCard, TrackerFlow, TrackerGroup } from '@shared/tracker'

import { rowStartOf } from './FlowSection.utils'

const card = (id: string, done: boolean): TrackerCard => ({
  id,
  title: id,
  subtitle: '',
  description: '',
  due: null,
  repeat: null,
  priority: 4,
  done,
  doneAt: null,
  scenario: null,
  autoRun: false,
  autoRunFailure: null,
  autoRunSent: false,
  run: null,
})

const group = (id: string, tasks: TrackerGroup['tasks']): TrackerGroup => ({
  id,
  title: id,
  subtitle: '',
  tasks,
})

const flow = (groups: TrackerGroup[]): TrackerFlow => ({
  id: 'f',
  title: 'F',
  subtitle: '',
  groups,
})

describe('куда встаёт ряд при открытии', () => {
  it('к первой колонке, где есть невыполненное, - и в продолжениях тоже', () => {
    expect(
      rowStartOf(
        flow([
          group('done', [{ ...card('a', true), followUps: [] }]),
          group('chain', [{ ...card('b', true), followUps: [card('b1', false)] }]),
          group('later', [{ ...card('c', false), followUps: [] }]),
        ]),
      ),
    ).toEqual({ kind: 'group', id: 'chain' })
  })

  it('пустая колонка не работа: её пропускают', () => {
    expect(
      rowStartOf(
        flow([group('empty', []), group('open', [{ ...card('a', false), followUps: [] }])]),
      ),
    ).toEqual({ kind: 'group', id: 'open' })
  })

  it('сделано всё - в конец ряда; колонок нет - в начало', () => {
    expect(rowStartOf(flow([group('done', [{ ...card('a', true), followUps: [] }])]))).toEqual({
      kind: 'end',
    })
    expect(rowStartOf(flow([]))).toBeNull()
  })
})

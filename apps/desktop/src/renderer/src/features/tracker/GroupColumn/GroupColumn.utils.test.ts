import { it, expect, describe } from 'vitest'

import type { TrackerCard, TrackerTask } from '@shared/tracker'

import type { LaneSlot } from './GroupColumn.types'
import { followUpLanes } from './GroupColumn.utils'

const card = (id: string): TrackerCard => ({
  id,
  title: `T ${id}`,
  subtitle: '',
  description: '',
  due: null,
  repeat: null,
  priority: 4,
  done: false,
  doneAt: null,
  scenario: null,
  autoRun: false,
  autoRunFailure: null,
  autoRunSent: false,
  run: null,
  lock: null,
})

const task = (id: string, followUps: string[]): TrackerTask => ({
  ...card(id),
  followUps: followUps.map(card),
})

// Столбик коротко: id карточки (с «!» у последней в цепочке) или «+задача» у поля.
const short = (lanes: LaneSlot[][]) =>
  lanes.map((lane) =>
    lane.map((slot) =>
      slot.kind === 'card' ? `${slot.card.id}${slot.last ? '!' : ''}` : `+${slot.taskId}`,
    ),
  )

const TASKS = [task('a', ['a1', 'a2']), task('b', []), task('c', ['c1'])]

describe('followUpLanes', () => {
  it('k-е продолжения задач - k-й столбик, по порядку группы и без пустот', () => {
    expect(short(followUpLanes(TASKS, null))).toEqual([['a1', 'c1!'], ['a2!']])
  })

  it('без продолжений столбиков нет', () => {
    expect(followUpLanes([task('a', []), task('b', [])], null)).toEqual([])
  })

  it('поле нового продолжения - за последней карточкой цепочки, на месте задачи', () => {
    expect(short(followUpLanes(TASKS, 'b'))).toEqual([['a1', '+b', 'c1!'], ['a2!']])
    expect(short(followUpLanes(TASKS, 'c'))).toEqual([
      ['a1', 'c1!'],
      ['a2!', '+c'],
    ])
  })

  it('поле за самой длинной цепочкой открывает новый столбик', () => {
    expect(short(followUpLanes(TASKS, 'a'))).toEqual([['a1', 'c1!'], ['a2!'], ['+a']])
  })

  it('поле задачи, которой в группе уже нет, не встаёт никуда', () => {
    expect(short(followUpLanes(TASKS, 'gone'))).toEqual([['a1', 'c1!'], ['a2!']])
  })
})

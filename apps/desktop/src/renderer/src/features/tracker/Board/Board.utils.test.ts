import { it, expect, describe } from 'vitest'

import type { TrackerCard, TrackerProject } from '@shared/tracker'

import { neighboursOf } from '../tracker.utils'
import { opOf, stepPlace, isSamePlace } from './Board.utils'

const card = (id: string): TrackerCard => ({
  id,
  title: id,
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

/** Доска: два потока, в первом две группы; в группе g1 задачи a (с продолжениями a1, a2) и b. */
const PROJECT: TrackerProject = {
  id: 'p',
  title: 'P',
  description: '',
  flows: [
    {
      id: 'f1',
      title: 'F1',
      subtitle: '',
      groups: [
        {
          id: 'g1',
          title: 'G1',
          subtitle: '',
          tasks: [
            { ...card('a'), followUps: [card('a1'), card('a2')] },
            { ...card('b'), followUps: [] },
          ],
        },
        { id: 'g2', title: 'G2', subtitle: '', tasks: [{ ...card('c'), followUps: [] }] },
      ],
    },
    { id: 'f2', title: 'F2', subtitle: '', groups: [] },
  ],
}

const near = neighboursOf(PROJECT)

describe('своё место', () => {
  it('бросок на своё же место ничего не меняет', () => {
    expect(
      isSamePlace(
        { kind: 'card', id: 'a' },
        { kind: 'card', groupId: 'g1', followUpOf: null, beforeId: 'b' },
        near,
      ),
    ).toBe(true)
    expect(
      isSamePlace(
        { kind: 'card', id: 'b' },
        { kind: 'card', groupId: 'g2', followUpOf: null, beforeId: null },
        near,
      ),
    ).toBe(false)
    expect(
      isSamePlace(
        { kind: 'group', id: 'g2' },
        { kind: 'group', flowId: 'f2', beforeId: null },
        near,
      ),
    ).toBe(false)
  })
})

describe('шаг клавишами и меню', () => {
  it('задача, продолжение, группа и поток двигаются на шаг; у края - некуда', () => {
    expect(stepPlace(PROJECT, { kind: 'card', id: 'a' }, 1)).toMatchObject({ beforeId: null })
    expect(stepPlace(PROJECT, { kind: 'card', id: 'a' }, -1)).toBeNull()
    expect(stepPlace(PROJECT, { kind: 'card', id: 'a2' }, -1)).toMatchObject({
      followUpOf: 'a',
      beforeId: 'a1',
    })
    expect(stepPlace(PROJECT, { kind: 'group', id: 'g2' }, -1)).toEqual({
      kind: 'group',
      flowId: 'f1',
      beforeId: 'g1',
    })
    expect(stepPlace(PROJECT, { kind: 'flow', id: 'f2' }, 1)).toBeNull()
  })

  it('правка броска', () => {
    expect(opOf('p', { kind: 'flow', id: 'f2' }, { kind: 'flow', beforeId: 'f1' })).toEqual({
      kind: 'flow.move',
      id: 'f2',
      projectId: 'p',
      beforeId: 'f1',
    })
  })
})

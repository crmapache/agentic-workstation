import { it, expect, describe } from 'vitest'

import type { TrackerCard, TrackerProject } from '@shared/tracker'

import { neighboursOf } from '../tracker.utils'
import type { Rect } from './Board.types'
import { opOf, placeOf, stepPlace, isSamePlace } from './Board.utils'

const card = (id: string): TrackerCard => ({
  id,
  title: id,
  subtitle: '',
  description: '',
  due: null,
  priority: 4,
  done: false,
  doneAt: null,
  scenario: null,
  run: null,
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
const RECT: Rect = { left: 100, top: 100, width: 200, height: 80 }

describe('место броска', () => {
  it('задача: верхняя половина - перед ней, нижняя - перед следующей', () => {
    const hit = { kind: 'card' as const, id: 'b', groupId: 'g1', followUp: false, rect: RECT }

    expect(placeOf(hit, 150, 110, { kind: 'card', id: 'c' }, near)?.place).toEqual({
      kind: 'card',
      groupId: 'g1',
      followUpOf: null,
      beforeId: 'b',
    })
    expect(placeOf(hit, 150, 170, { kind: 'card', id: 'c' }, near)?.place).toMatchObject({
      beforeId: null,
    })
  })

  it('продолжение: левая половина - перед ним в цепочке, правая - после', () => {
    const hit = { kind: 'card' as const, id: 'a1', groupId: 'g1', followUp: true, rect: RECT }

    expect(placeOf(hit, 120, 140, { kind: 'card', id: 'b' }, near)?.place).toEqual({
      kind: 'card',
      groupId: 'g1',
      followUpOf: 'a',
      beforeId: 'a1',
    })
    expect(placeOf(hit, 280, 140, { kind: 'card', id: 'b' }, near)?.place).toMatchObject({
      followUpOf: 'a',
      beforeId: 'a2',
    })
  })

  it('задачу не кладут в её же цепочку и на неё саму', () => {
    const onFollowUp = {
      kind: 'card' as const,
      id: 'a1',
      groupId: 'g1',
      followUp: true,
      rect: RECT,
    }
    const onChain = { kind: 'chain' as const, rootId: 'a', groupId: 'g1', rect: RECT }

    expect(placeOf(onFollowUp, 120, 140, { kind: 'card', id: 'a' }, near)).toBeNull()
    expect(placeOf(onChain, 120, 140, { kind: 'card', id: 'a' }, near)).toBeNull()
  })

  it('группа - по половине шапки, поток - выше или ниже', () => {
    const group = {
      kind: 'group' as const,
      id: 'g1',
      flowId: 'f1',
      rect: { ...RECT, width: 800 },
      head: RECT,
      end: null,
    }

    // Правее середины шапки, но левее середины широкой колонки - всё равно «после».
    expect(placeOf(group, 250, 140, { kind: 'group', id: 'g2' }, near)?.place).toEqual({
      kind: 'group',
      flowId: 'f1',
      beforeId: 'g2',
    })

    const flow = { kind: 'flow' as const, id: 'f1', rect: RECT }

    expect(placeOf(flow, 150, 170, { kind: 'flow', id: 'f2' }, near)?.place).toEqual({
      kind: 'flow',
      beforeId: 'f2',
    })
  })

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

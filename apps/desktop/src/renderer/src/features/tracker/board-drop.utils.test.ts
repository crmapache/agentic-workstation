import { it, expect, describe } from 'vitest'

import type { TrackerCard, TrackerProject } from '@shared/tracker'

import { placeOf, clipMark } from './board-drop.utils'
import { neighboursOf } from './tracker.utils'
import type { Rect } from './Board/Board.types'

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

const cardHit = (id: string, followUp = false) => ({
  kind: 'card' as const,
  id,
  groupId: 'g1',
  followUp,
  rect: RECT,
  gap: 12,
  chainGap: 12,
})

describe('место броска карточки', () => {
  it('задача: верхняя половина - перед ней, нижняя - перед следующей; линия посреди зазора', () => {
    const above = placeOf(cardHit('b'), 150, 110, { kind: 'card', id: 'c' }, near)

    expect(above?.place).toEqual({ kind: 'card', groupId: 'g1', followUpOf: null, beforeId: 'b' })
    expect(above?.mark).toEqual({ axis: 'h', x: 100, y: 94, length: 200 })
    expect(placeOf(cardHit('b'), 150, 170, { kind: 'card', id: 'c' }, near)).toMatchObject({
      place: { beforeId: null },
      mark: { y: 186 },
    })
  })

  it('правый край задачи - первой в её цепочке, даже если продолжений нет', () => {
    expect(placeOf(cardHit('b'), 290, 110, { kind: 'card', id: 'c' }, near)).toEqual({
      place: { kind: 'card', groupId: 'g1', followUpOf: 'b', beforeId: null },
      mark: { axis: 'v', x: 306, y: 100, length: 80 },
    })
    expect(placeOf(cardHit('a'), 290, 110, { kind: 'card', id: 'c' }, near)?.place).toMatchObject({
      followUpOf: 'a',
      beforeId: 'a1',
    })
  })

  it('продолжение: левая половина - перед ним в цепочке, правая - после', () => {
    expect(placeOf(cardHit('a1', true), 120, 140, { kind: 'card', id: 'b' }, near)?.place).toEqual({
      kind: 'card',
      groupId: 'g1',
      followUpOf: 'a',
      beforeId: 'a1',
    })
    expect(
      placeOf(cardHit('a1', true), 280, 140, { kind: 'card', id: 'b' }, near)?.place,
    ).toMatchObject({ followUpOf: 'a', beforeId: 'a2' })
  })

  it('задачу не кладут в её же цепочку и на неё саму', () => {
    expect(placeOf(cardHit('a1', true), 120, 140, { kind: 'card', id: 'a' }, near)).toBeNull()
    expect(placeOf(cardHit('a'), 290, 140, { kind: 'card', id: 'a' }, near)).toBeNull()
  })

  it('колонка мимо карточек - в конец группы', () => {
    const group = { kind: 'group' as const, id: 'g2', end: RECT, gap: 12 }

    expect(placeOf(group, 150, 300, { kind: 'card', id: 'a' }, near)?.place).toEqual({
      kind: 'card',
      groupId: 'g2',
      followUpOf: null,
      beforeId: null,
    })
  })
})

describe('место группы и потока', () => {
  // Ряд: g1 - широкая колонка (цепочки) с узкой шапкой, g2 правее, зазор 16.
  const row = {
    kind: 'row' as const,
    flowId: 'f1',
    columns: [
      { id: 'g1', rect: { ...RECT, width: 500 }, head: RECT },
      { id: 'g2', rect: { ...RECT, left: 616 }, head: { ...RECT, left: 616 } },
    ],
    box: { left: 0, top: 50, width: 1000, height: 400 },
    end: { ...RECT, left: 832 },
    gap: 16,
  }

  it('по середине шапки, линия - посреди зазора во всю высоту ряда', () => {
    // Правее середины шапки, но левее середины широкой колонки - всё равно «после».
    expect(placeOf(row, 250, 140, { kind: 'group', id: 'g2' }, near)).toEqual({
      place: { kind: 'group', flowId: 'f1', beforeId: 'g2' },
      mark: { axis: 'v', x: 608, y: 50, length: 400 },
    })
    expect(placeOf(row, 120, 140, { kind: 'group', id: 'g2' }, near)?.place).toMatchObject({
      beforeId: 'g1',
    })
    // Правее всех колонок - в конец потока, линия - после последней.
    expect(placeOf(row, 900, 140, { kind: 'group', id: 'g1' }, near)).toMatchObject({
      place: { beforeId: null },
      mark: { x: 824 },
    })
  })

  it('пустой ряд - в конец потока у кнопки новой группы', () => {
    const empty = { ...row, flowId: 'f2', columns: [] }

    expect(placeOf(empty, 120, 140, { kind: 'group', id: 'g1' }, near)).toMatchObject({
      place: { kind: 'group', flowId: 'f2', beforeId: null },
      mark: { x: 832 },
    })
  })

  it('поток - выше или ниже потока под рукой', () => {
    const flow = { kind: 'flow' as const, id: 'f1', rect: RECT, gap: 24 }

    expect(placeOf(flow, 150, 170, { kind: 'flow', id: 'f2' }, near)?.place).toEqual({
      kind: 'flow',
      beforeId: 'f2',
    })
  })
})

describe('линия места в пределах страницы', () => {
  const view: Rect = { left: 0, top: 100, width: 800, height: 500 }

  it('вертикальная режется по высоте и прижимается к краю', () => {
    expect(clipMark({ axis: 'v', x: 900, y: 0, length: 1000 }, view)).toEqual({
      axis: 'v',
      x: 800,
      y: 100,
      length: 500,
    })
  })

  it('горизонтальная режется по ширине; вовсе за краем - нулевой длины', () => {
    expect(clipMark({ axis: 'h', x: 700, y: 300, length: 200 }, view)).toMatchObject({
      x: 700,
      length: 100,
    })
    expect(clipMark({ axis: 'h', x: 900, y: 300, length: 200 }, view).length).toBe(0)
  })
})

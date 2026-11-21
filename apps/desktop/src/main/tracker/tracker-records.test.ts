import { it, expect, describe } from 'vitest'

import { TrackerClock } from './tracker-clock'
import type { TrackerRecord } from './tracker-records'
import { isAlive, sameFields, decodeRecord, encodeRecord, mergeRecords } from './tracker-records'

const record = (fields: TrackerRecord['fields']): TrackerRecord => ({
  id: 'card-1',
  kind: 'card',
  fields,
})

describe('слияние по полю', () => {
  it('каждое поле берётся с поздней отметкой', () => {
    const local = record({ title: ['Новое имя', '2'], group: ['g1', '1'] })
    const remote = record({ title: ['Старое имя', '1'], group: ['g2', '3'], done: [true, '3'] })
    const merged = mergeRecords(local, remote)

    expect(merged.fields).toEqual({
      title: ['Новое имя', '2'],
      group: ['g2', '3'],
      done: [true, '3'],
    })
    expect(mergeRecords(remote, local).fields).toEqual(merged.fields)
  })

  it('удаление переживает старую правку другого компьютера', () => {
    const removed = record({ title: ['A', '1'], deleted: [true, '5'] })
    const stale = record({ title: ['B', '4'] })
    const merged = mergeRecords(stale, removed)

    expect(isAlive(merged)).toBe(false)
    expect(merged.fields.title).toEqual(['B', '4'])
  })

  it('одинаковость не зависит от порядка полей', () => {
    expect(
      sameFields(record({ a: [1, '1'], b: [2, '1'] }), record({ b: [2, '1'], a: [1, '1'] })),
    ).toBe(true)
    expect(sameFields(record({ a: [1, '1'] }), record({ a: [1, '2'] }))).toBe(false)
    expect(sameFields(record({ a: [1, '1'] }), record({ a: [1, '1'], b: [2, '1'] }))).toBe(false)
  })
})

describe('текст записи', () => {
  it('туда и обратно', () => {
    const one = record({ title: ['Задача', '1'], due: [{ date: '2026-11-21', time: null }, '1'] })

    expect(decodeRecord('card-1', encodeRecord(one))).toEqual(one)
  })

  it('чужой текст - не запись, битое поле пропускается', () => {
    expect(decodeRecord('x', 'not json')).toBeNull()
    expect(decodeRecord('x', '{"k":"user","f":{}}')).toBeNull()
    expect(decodeRecord('x', '{"k":"flow","f":{"title":"no stamp","rank":["a","1"]}}')).toEqual({
      id: 'x',
      kind: 'flow',
      fields: { rank: ['a', '1'] },
    })
  })
})

describe('часы правок', () => {
  it('растут и внутри одной миллисекунды', () => {
    const clock = new TrackerClock('aaaaaaaa', () => 1000)
    const first = clock.tick()
    const second = clock.tick()

    expect(second > first).toBe(true)
  })

  it('не идут назад и продолжают от чужой отметки из будущего', () => {
    let now = 5000
    const clock = new TrackerClock('aaaaaaaa', () => now)
    const fast = new TrackerClock('bbbbbbbb', () => 9000)
    const future = fast.tick()

    clock.observe(future)
    now = 4000

    expect(clock.tick() > future).toBe(true)
  })
})

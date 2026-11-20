import { it, expect, describe } from 'vitest'

import type { TabRef } from './tab-order'
import {
  placeOf,
  regroup,
  pinGroup,
  placeNew,
  moveGroup,
  neighbourOf,
  placeReopened,
  moveWithinGroup,
} from './tab-order'

/** Вкладка: id, группа (по умолчанию своя), глубина, проект /p. */
const tab = (id: string, groupId = id, depth = 0, projectPath = '/p'): TabRef => ({
  id,
  groupId,
  depth,
  projectPath,
})

const ids = (tabs: readonly TabRef[] | null) => tabs?.map((item) => item.id) ?? null

// a и его форки a1, a2; b - одиночка; c - одиночка другого проекта между ними.
const strip = [tab('a'), tab('a1', 'a', 1), tab('a2', 'a', 1), tab('c', 'c', 0, '/q'), tab('b')]

describe('порядок полосы вкладок', () => {
  it('группа собирается к своей первой вкладке, правильный порядок не меняется', () => {
    expect(ids(regroup([tab('a'), tab('b'), tab('a1', 'a', 1)]))).toEqual(['a', 'a1', 'b'])
    expect(ids(regroup(strip))).toEqual(ids(strip))
  })

  it('форк встаёт за последней вкладкой своей группы, новая - в конец', () => {
    expect(ids(placeNew(strip, tab('a3', 'a', 2)))).toEqual(['a', 'a1', 'a2', 'a3', 'c', 'b'])
    expect(ids(placeNew(strip, tab('d')))).toEqual(['a', 'a1', 'a2', 'c', 'b', 'd'])
  })

  it('группа переезжает целиком; на месте - null', () => {
    expect(ids(moveGroup(strip, 'b', 'a'))).toEqual(['b', 'a', 'a1', 'a2', 'c'])
    expect(ids(moveGroup(strip, 'a', null))).toEqual(['c', 'b', 'a', 'a1', 'a2'])
    expect(moveGroup(strip, 'b', null)).toBeNull()
    expect(moveGroup(strip, 'zzz', null)).toBeNull()
  })

  it('форк ходит только внутри группы и не встаёт перед головой', () => {
    expect(ids(moveWithinGroup(strip, 'a2', 'a1'))).toEqual(['a', 'a2', 'a1', 'c', 'b'])
    expect(ids(moveWithinGroup(strip, 'a2', 'a'))).toEqual(['a', 'a2', 'a1', 'c', 'b'])
    expect(moveWithinGroup(strip, 'a', null)).toBeNull()
    // В группе из двух переставлять нечего: жест тащит группу целиком.
    expect(moveWithinGroup([tab('x'), tab('x1', 'x', 1)], 'x1', 'x')).toBeNull()
  })

  it('после закрытия - сосед справа в том же проекте, у последней - слева', () => {
    expect(neighbourOf(strip, 'a1')).toBe('a2')
    expect(neighbourOf(strip, 'a2')).toBe('b')
    expect(neighbourOf(strip, 'b')).toBe('a2')
    expect(neighbourOf([tab('only')], 'only')).toBeNull()
  })

  it('закрытый форк возвращается за прежним левым соседом в свою группу', () => {
    const place = placeOf(strip, 'a2')
    const without = strip.filter((item) => item.id !== 'a2')

    expect(place).toEqual({ groupsLeft: [], tabsLeft: ['a', 'a1'] })
    expect(ids(placeReopened(without, tab('a2', 'a', 1), place))).toEqual(ids(strip))
  })

  it('голова возвращается в начало своей группы, форки под ней снова её', () => {
    const without = strip.filter((item) => item.id !== 'a')
    const back = placeReopened(without, tab('a'), placeOf(strip, 'a'))

    expect(ids(back)).toEqual(ids(strip))
    expect(back[0]?.depth).toBe(0)
  })

  it('группы нет - своей группой за последней из прежних левых групп', () => {
    const lone = [tab('x'), tab('y'), tab('z')]
    const place = placeOf(lone, 'y')
    const back = placeReopened([tab('x'), tab('z')], tab('y', 'gone', 2), place)

    expect(ids(back)).toEqual(['x', 'y', 'z'])
    expect(back[1]).toMatchObject({ groupId: 'y', depth: 0 })
    // Левых групп не осталось - в начало проекта.
    expect(ids(placeReopened([tab('z')], tab('y'), place))).toEqual(['y', 'z'])
  })
})

describe('закреплённые вкладки', () => {
  const pinned = (ref: TabRef): TabRef => ({ ...ref, pinned: true })
  // p - закреплённая группа с форком p1; a, b - обычные; c - другой проект между ними.
  const zoned = [
    pinned(tab('p')),
    pinned(tab('p1', 'p', 1)),
    tab('a'),
    tab('c', 'c', 0, '/q'),
    tab('b'),
  ]

  it('закреплённая группа встаёт в конец зоны закреплённых, откреплённая - в начало остальных', () => {
    expect(ids(pinGroup(zoned, 'b', true))).toEqual(['p', 'p1', 'b', 'a', 'c'])
    expect(ids(pinGroup(zoned, 'p', false))).toEqual(['p', 'p1', 'a', 'c', 'b'])
    expect(pinGroup(zoned, 'p', true)).toBeNull()
  })

  it('закрепляется группа целиком, группа форков не разрывается чужим проектом', () => {
    const between = [tab('a'), tab('c', 'c', 0, '/q'), tab('b'), tab('b1', 'b', 1)]
    const next = pinGroup(between, 'b', true) ?? []

    expect(ids(next)).toEqual(['b', 'b1', 'a', 'c'])
    expect(next.filter((item) => item.pinned).map((item) => item.id)).toEqual(['b', 'b1'])
    expect(ids(moveWithinGroup(next, 'b1', null))).toBeNull()
  })

  it('группа не уходит из своей зоны и не входит в чужую', () => {
    // Обычную бросили перед закреплённой - встаёт у границы, первой среди обычных.
    expect(ids(moveGroup(zoned, 'b', 'p'))).toEqual(['p', 'p1', 'b', 'a', 'c'])
    // Закреплённую - в конец - остаётся в своей зоне.
    expect(moveGroup(zoned, 'p', null)).toBeNull()
  })

  it('форк закреплённой - закреплён, порядок с диска чинится', () => {
    const forked = placeNew(zoned, tab('p2', 'p', 1))

    expect(forked.find((item) => item.id === 'p2')?.pinned).toBe(true)
    expect(ids(regroup([tab('a'), pinned(tab('p')), tab('b')]))).toEqual(['p', 'a', 'b'])
  })
})

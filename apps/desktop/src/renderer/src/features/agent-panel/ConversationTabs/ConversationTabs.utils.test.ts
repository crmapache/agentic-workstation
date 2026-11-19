import { it, expect, describe } from 'vitest'

import type { TabRect } from './ConversationTabs.types'
import {
  rowFor,
  shotOf,
  placeOn,
  beforeOf,
  callTone,
  endsGroup,
  tabBeside,
} from './ConversationTabs.utils'

/** Вкладка ширины 100 на ряду top, в единице unit. */
const rect = (key: string, left: number, top = 0, unit: string | undefined = key): TabRect => ({
  key,
  unit,
  left,
  right: left + 100,
  top,
})

describe('полоса вкладок разговоров', () => {
  it('зазор группы - за последней вкладкой группы, но не за последней на полосе', () => {
    const tabs = [{ groupId: 'a' }, { groupId: 'a' }, { groupId: 'b' }, { groupId: 'c' }]

    expect(tabs.map((_, index) => endsGroup(tabs, index))).toEqual([false, true, true, false])
  })

  it('повод звука - в три цвета света', () => {
    expect(callTone('turnDone')).toBe('success')
    expect(callTone('limit')).toBe('attention')
    expect(callTone('error')).toBe('danger')
  })

  it('следующая и предыдущая - по кругу', () => {
    expect(tabBeside(['a', 'b', 'c'], 'c', 1)).toBe('a')
    expect(tabBeside(['a', 'b', 'c'], 'a', -1)).toBe('c')
    expect(tabBeside(['a', 'b'], 'gone', -1)).toBe('b')
    expect(tabBeside([], 'a', 1)).toBe('')
  })
})

describe('перетаскивание вкладок', () => {
  // Два ряда: a, b, c наверху, d, e внизу; группа g переносится на два ряда.
  const rects = [
    rect('a', 0),
    rect('b', 100),
    rect('g1', 200, 0, 'g'),
    rect('g2', 0, 40, 'g'),
    rect('d', 100, 40),
    rect('e', 200, 40),
  ]
  const shot = shotOf(rects)

  it('снимок: единицы по порядку, ряды и группа на двух рядах - две коробки', () => {
    expect(shot.units).toEqual(['a', 'b', 'g', 'd', 'e'])
    expect(shot.lines).toEqual([0, 40])
    expect(shot.boxes.filter((box) => box.index === 2)).toHaveLength(2)
  })

  it('ряд держится, пока другой не ближе на запас', () => {
    expect(rowFor([0, 40], 18, 0)).toBe(0)
    expect(rowFor([0, 40], 30, 0)).toBe(1)
  })

  it('вдоль ряда сосед уступает, когда передний край прошёл его середину', () => {
    const carried = shot.boxes[0]

    if (!carried) throw new Error('нет коробки')

    expect(placeOn(shot.boxes, 0, carried, 0, 40)).toBe(0)
    expect(placeOn(shot.boxes, 0, carried, 0, 60)).toBe(1)
    expect(beforeOf(shot.units, 0, 1)).toBe('g')
  })

  it('на чужом ряду, не пройдя середин, - к ближнему краю ряда', () => {
    const carried = shot.boxes[0]

    if (!carried) throw new Error('нет коробки')

    // Вниз на второй ряд, левее всех: встать перед первой единицей нижнего ряда.
    expect(placeOn(shot.boxes, 0, carried, 1, -400)).toBe(1)
    expect(beforeOf(shot.units, 0, 4)).toBeNull()
  })
})

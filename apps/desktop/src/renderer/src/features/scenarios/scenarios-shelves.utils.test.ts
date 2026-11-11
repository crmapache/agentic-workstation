import { it, expect, describe } from 'vitest'

import type { RowBox, Arrangement } from './scenarios-shelves.utils'
import {
  placed,
  rowKey,
  idOfRow,
  landing,
  stepped,
  isMovable,
  placement,
  shelvesOpen,
  shelfEntries,
  arrangementOf,
} from './scenarios-shelves.utils'

const both: Arrangement = { project: ['project:a', 'project:b'], user: ['user:c'] }
const open = { project: true, user: true }

// Две строки проектной полки по 50, заголовок личной - граница на 130, под ним строка C.
const rows: RowBox[] = [
  { key: 'project:a', shelf: 'project', top: 0, height: 50 },
  { key: 'project:b', shelf: 'project', top: 56, height: 50 },
  { key: 'user:c', shelf: 'user', top: 150, height: 50 },
]

describe('раскладка полок', () => {
  it('ключ строки - полка и id, id достаётся обратно и с двоеточием внутри', () => {
    expect(rowKey({ id: 'x:y', scope: 'user' })).toBe('user:x:y')
    expect(idOfRow('user:x:y')).toBe('x:y')
  })

  it('полки из списка главного процесса - в его порядке', () => {
    expect(
      arrangementOf([
        { id: 'a', scope: 'project' },
        { id: 'c', scope: 'user' },
        { id: 'b', scope: 'project' },
      ]),
    ).toEqual({ project: ['project:a', 'project:b'], user: ['user:c'] })
  })

  it('строка ставится на другое место своей полки и на соседнюю', () => {
    expect(placed(both, 'project:a', { shelf: 'project', index: 1 }).project).toEqual([
      'project:b',
      'project:a',
    ])
    expect(placed(both, 'project:a', { shelf: 'user', index: 0 })).toEqual({
      project: ['project:b'],
      user: ['project:a', 'user:c'],
    })
    expect(placed(both, 'user:c', { shelf: 'project', index: 99 }).project).toEqual([
      'project:a',
      'project:b',
      'user:c',
    ])
  })
})

describe('что сказать главному процессу', () => {
  it('положили туда же - ничего', () => {
    expect(placement(both, both, 'project:a')).toBeNull()
  })

  it('соседа снизу, а не номер; последней - пусто', () => {
    const down = placed(both, 'project:a', { shelf: 'project', index: 1 })

    expect(placement(both, down, 'project:a')).toEqual({
      id: 'a',
      from: 'project',
      to: 'project',
      before: '',
    })

    const across = placed(both, 'project:b', { shelf: 'user', index: 0 })

    expect(placement(both, across, 'project:b')).toEqual({
      id: 'b',
      from: 'project',
      to: 'user',
      before: 'c',
    })
  })
})

describe('куда строку можно положить', () => {
  it('без папки проекта проектная полка закрыта', () => {
    expect(shelvesOpen(both, 'user:c', false)).toEqual({ project: false, user: true })
  })

  it('полка с двойником по id закрыта', () => {
    const twins: Arrangement = { project: ['project:a'], user: ['user:a'] }

    expect(shelvesOpen(twins, 'project:a', true)).toEqual({ project: true, user: false })
  })

  it('одной строке на единственной полке двигаться некуда', () => {
    const alone: Arrangement = { project: [], user: ['user:c'] }

    expect(isMovable(alone, 'user:c', false)).toBe(false)
    expect(isMovable(alone, 'user:c', true)).toBe(true)
    expect(isMovable(both, 'project:a', false)).toBe(true)
  })
})

describe('куда ляжет несомая строка', () => {
  const lift = (top: number, key = 'project:a', origin = 0) =>
    landing({ key, from: 'project', top, bottom: top + 50, origin, rows, boundary: 130, open })

  it('место на полке - по переднему краю: нижний край за серединой соседа', () => {
    // Середина B - 81: нижний край 80 ещё не за ней, 82 - уже за.
    expect(lift(30)).toEqual({ shelf: 'project', index: 0 })
    expect(lift(32)).toEqual({ shelf: 'project', index: 1 })
  })

  it('выше своего места ведёт верхний край', () => {
    // B поднимают: её место на 56, A - середина 25.
    expect(lift(26, 'project:b', 56)).toEqual({ shelf: 'project', index: 1 })
    expect(lift(24, 'project:b', 56)).toEqual({ shelf: 'project', index: 0 })
  })

  it('полку решает середина карточки, а не край', () => {
    // Середина 129 - ещё проектная, хотя нижний край давно за границей.
    expect(lift(104).shelf).toBe('project')
    expect(lift(106)).toEqual({ shelf: 'user', index: 0 })
    // Нижний край за серединой C (175) - после неё.
    expect(lift(126)).toEqual({ shelf: 'user', index: 1 })
  })

  it('закрытая полка строку не берёт: она остаётся на своей', () => {
    const closed = landing({
      key: 'project:a',
      from: 'project',
      top: 160,
      bottom: 210,
      origin: 0,
      rows,
      boundary: 130,
      open: { project: true, user: false },
    })

    expect(closed).toEqual({ shelf: 'project', index: 1 })
  })

  it('без границы полка одна', () => {
    expect(
      landing({
        key: 'project:a',
        from: 'project',
        top: 200,
        bottom: 250,
        origin: 0,
        rows,
        boundary: null,
        open,
      }),
    ).toEqual({ shelf: 'project', index: 1 })
  })
})

describe('стрелки', () => {
  it('вниз по полке, потом на первое место соседней', () => {
    expect(stepped(both, 'project:a', { shelf: 'project', index: 0 }, true, open)).toEqual({
      shelf: 'project',
      index: 1,
    })
    expect(stepped(both, 'project:a', { shelf: 'project', index: 1 }, true, open)).toEqual({
      shelf: 'user',
      index: 0,
    })
  })

  it('вверх с первого места личной - на последнее место проектной', () => {
    expect(stepped(both, 'user:c', { shelf: 'user', index: 0 }, false, open)).toEqual({
      shelf: 'project',
      index: 2,
    })
  })

  it('двигаться некуда - то же место', () => {
    const at = { shelf: 'user' as const, index: 0 }

    expect(stepped(both, 'user:c', at, true, open)).toBe(at)
    expect(stepped(both, 'user:c', at, false, { project: false, user: true })).toBe(at)
  })
})

describe('полка на экране посреди жеста', () => {
  it('несомая стоит на своём месте спрятанной, место - перед строкой, которую она обгонит', () => {
    expect(shelfEntries(['project:a', 'project:x', 'project:c'], 'project:x', 1)).toEqual([
      { kind: 'row', key: 'project:a', hidden: false },
      { kind: 'row', key: 'project:x', hidden: true },
      { kind: 'slot' },
      { kind: 'row', key: 'project:c', hidden: false },
    ])
  })

  it('место за краем - в конце; строка ушла на соседнюю полку - места здесь нет', () => {
    expect(shelfEntries(['user:c'], null, 7)).toEqual([
      { kind: 'row', key: 'user:c', hidden: false },
      { kind: 'slot' },
    ])
    expect(shelfEntries(['project:x'], 'project:x', null)).toEqual([
      { kind: 'row', key: 'project:x', hidden: true },
    ])
  })
})

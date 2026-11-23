import { it, expect, describe } from 'vitest'

import type { BarArrangement } from './bar-buttons.types'
import {
  shownIds,
  withShown,
  menuGroups,
  movedOrder,
  arrangedIds,
  mergedOrder,
  restoreArrangements,
} from './bar-buttons.utils'

const DEFAULTS = ['files', 'changes', 'ext:todo.list']

describe('порядок кнопок полосы', () => {
  it('без своего порядка - как задумано в IDE', () => {
    expect(mergedOrder(DEFAULTS)).toEqual(DEFAULTS)
  })

  it('новая кнопка встаёт сразу за соседом, который у IDE стоит перед ней', () => {
    expect(mergedOrder(['a', 'x', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'x', 'b'])
    expect(mergedOrder(['x', 'a', 'b'], ['b', 'a'])).toEqual(['x', 'b', 'a'])
  })

  it('кнопка, которой сейчас нет, держит своё место и возвращается на него', () => {
    const arrangement: BarArrangement = {
      order: { top: ['ext:todo.list', 'changes', 'files'] },
      hidden: [],
    }

    expect(shownIds(['files', 'changes'], arrangement, 'top')).toEqual(['changes', 'files'])
    expect(shownIds(DEFAULTS, arrangement, 'top')).toEqual(['ext:todo.list', 'changes', 'files'])
  })

  it('спрятанная пропадает из полосы, но остаётся в меню на своём месте', () => {
    const arrangement: BarArrangement = { order: {}, hidden: ['changes'] }

    expect(shownIds(DEFAULTS, arrangement, 'top')).toEqual(['files', 'ext:todo.list'])
    expect(arrangedIds(DEFAULTS, arrangement, 'top')).toEqual(DEFAULTS)
  })

  it('у групп свой порядок: перестановка в одной не трогает другую', () => {
    const arrangement: BarArrangement = {
      order: { bottom: ['settings', 'statistics'] },
      hidden: [],
    }

    expect(shownIds(DEFAULTS, arrangement, 'top')).toEqual(DEFAULTS)
    expect(shownIds(['statistics', 'settings'], arrangement, 'bottom')).toEqual([
      'settings',
      'statistics',
    ])
  })
})

describe('перетаскивание кнопки', () => {
  it('встаёт перед соседом, на которого её бросили', () => {
    expect(movedOrder(['a', 'b', 'c'], ['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
    expect(movedOrder(['a', 'b', 'c'], ['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'a', 'c'])
  })

  it('в конец - сразу за последней видной, спрятанные за ней остаются за ней', () => {
    expect(movedOrder(['a', 'b', 'c', 'h'], ['a', 'b', 'c'], 'a', null)).toEqual([
      'b',
      'c',
      'a',
      'h',
    ])
  })

  it('id, которых сейчас нет, сохраняются в порядке', () => {
    expect(movedOrder(['gone', 'a', 'b'], ['a', 'b'], 'b', 'a')).toEqual(['gone', 'b', 'a'])
  })
})

describe('галочки и сохранённое', () => {
  it('меню - группы по порядку полосы, спрятанные без галочки, пустых групп нет', () => {
    const groups = {
      top: [{ id: 'files' }, { id: 'changes' }],
      bottom: [] as { id: string }[],
    }
    const arrangement: BarArrangement = { order: { top: ['changes', 'files'] }, hidden: ['files'] }

    expect(menuGroups(groups, arrangement)).toEqual([
      [
        { button: { id: 'changes' }, shown: true },
        { button: { id: 'files' }, shown: false },
      ],
    ])
  })

  it('галочка ставит и прячет кнопку, повтор ничего не ломает', () => {
    expect(withShown([], 'files', false)).toEqual(['files'])
    expect(withShown(['files'], 'files', false)).toEqual(['files'])
    expect(withShown(['files', 'changes'], 'files', true)).toEqual(['changes'])
  })

  it('из localStorage берётся только то, что той формы', () => {
    expect(restoreArrangements(null)).toEqual({})
    expect(
      restoreArrangements({
        bars: {
          side: { order: { top: ['changes', 'files'], bottom: 'oops' }, hidden: ['changes'] },
          main: { order: null, hidden: [1, 2] },
          left: { order: {}, hidden: [] },
        },
      }),
    ).toEqual({
      side: { order: { top: ['changes', 'files'] }, hidden: ['changes'] },
      main: { order: {}, hidden: [] },
    })
  })
})

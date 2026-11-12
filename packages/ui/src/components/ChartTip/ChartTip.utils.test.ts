import { it, expect, describe } from 'vitest'

import { nextMark } from './ChartTip.utils'

const BARS = { across: 1, down: null }
const CALENDAR = { across: 7, down: 1 }

describe('nextMark', () => {
  it('стрелки двигают на шаг и упираются в края, а не ходят по кругу', () => {
    expect(nextMark('ArrowRight', 3, 10, BARS)).toBe(4)
    expect(nextMark('ArrowRight', 9, 10, BARS)).toBe(9)
    expect(nextMark('ArrowLeft', 0, 10, BARS)).toBe(0)
  })

  it('в календаре вбок - неделя, вверх и вниз - день', () => {
    expect(nextMark('ArrowRight', 3, 30, CALENDAR)).toBe(10)
    expect(nextMark('ArrowLeft', 3, 30, CALENDAR)).toBe(0)
    expect(nextMark('ArrowDown', 3, 30, CALENDAR)).toBe(4)
    expect(nextMark('ArrowUp', 3, 30, CALENDAR)).toBe(2)
  })

  it('у столбцов вверх и вниз никуда не ведут', () => {
    expect(nextMark('ArrowDown', 3, 10, BARS)).toBeNull()
  })

  it('ничего не выбрано - первая стрелка ставит на самое свежее', () => {
    expect(nextMark('ArrowLeft', null, 10, BARS)).toBe(9)
  })

  it('Home и End - к краям, пустой график и чужие клавиши - никуда', () => {
    expect(nextMark('Home', 5, 10, BARS)).toBe(0)
    expect(nextMark('End', 5, 10, BARS)).toBe(9)
    expect(nextMark('ArrowRight', 0, 0, BARS)).toBeNull()
    expect(nextMark('Enter', 2, 10, BARS)).toBeNull()
  })
})

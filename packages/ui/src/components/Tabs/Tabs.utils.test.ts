import { it, expect, describe } from 'vitest'

import { nextTabIndex } from './Tabs.utils'

describe('nextTabIndex', () => {
  it('стрелки ходят по кругу', () => {
    expect(nextTabIndex('ArrowRight', 0, 3)).toBe(1)
    expect(nextTabIndex('ArrowRight', 2, 3)).toBe(0)
    expect(nextTabIndex('ArrowLeft', 0, 3)).toBe(2)
  })

  it('Home и End - к краям', () => {
    expect(nextTabIndex('Home', 2, 3)).toBe(0)
    expect(nextTabIndex('End', 0, 3)).toBe(2)
  })

  it('у столбца ходят стрелки вверх и вниз, а не вбок', () => {
    expect(nextTabIndex('ArrowDown', 2, 3, 'vertical')).toBe(0)
    expect(nextTabIndex('ArrowUp', 0, 3, 'vertical')).toBe(2)
    expect(nextTabIndex('ArrowRight', 0, 3, 'vertical')).toBeNull()
  })

  it('чужие клавиши и пустой ряд - никуда', () => {
    expect(nextTabIndex('ArrowDown', 0, 3)).toBeNull()
    expect(nextTabIndex('ArrowRight', 0, 0)).toBeNull()
  })
})

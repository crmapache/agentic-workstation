import { it, expect, describe } from 'vitest'

import { CURSOR_PATH, moveDuration } from './overlay.utils'

describe('курсор агента', () => {
  it('едет не быстрее и не дольше пределов', () => {
    expect(moveDuration({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(160)
    expect(moveDuration({ x: 0, y: 0 }, { x: 5000, y: 0 })).toBe(480)
    expect(moveDuration({ x: 0, y: 0 }, { x: 660, y: 0 })).toBe(300)
  })

  it('острие стрелки - у начала координат: слой сдвигает её на 2 px, нажатие - в острие', () => {
    const [x = 0, y = 0] = (/^M([\d.]+) ([\d.]+)/.exec(CURSOR_PATH) ?? []).slice(1).map(Number)

    expect(x).toBeLessThan(3)
    expect(y).toBeLessThan(4)
  })
})

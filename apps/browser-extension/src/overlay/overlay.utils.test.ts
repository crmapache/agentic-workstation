import { it, expect, describe } from 'vitest'

import { moveDuration, CURSOR_POINTS } from './overlay.utils'

describe('курсор агента', () => {
  it('едет не быстрее и не дольше пределов', () => {
    expect(moveDuration({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(160)
    expect(moveDuration({ x: 0, y: 0 }, { x: 5000, y: 0 })).toBe(480)
    expect(moveDuration({ x: 0, y: 0 }, { x: 660, y: 0 })).toBe(300)
  })

  it('острие стрелки - в начале координат', () => {
    expect(CURSOR_POINTS.startsWith('1,1 ')).toBe(true)
  })
})

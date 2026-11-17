import { it, expect, describe } from 'vitest'

import { moveDuration } from './overlay.utils'

describe('курсор агента', () => {
  it('едет не быстрее и не дольше пределов', () => {
    expect(moveDuration({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(160)
    expect(moveDuration({ x: 0, y: 0 }, { x: 5000, y: 0 })).toBe(480)
    expect(moveDuration({ x: 0, y: 0 }, { x: 660, y: 0 })).toBe(300)
  })
})

import { it, expect, describe } from 'vitest'

import { AGENT_POINTER_PATH } from './AgentPointer.constants'

describe('стрелка ИИ', () => {
  it('острие - у начала поля: стрелка сдвинута на 2 px, нажатие приходится в острие', () => {
    const [x = 0, y = 0] = (/^M([\d.]+) ([\d.]+)/.exec(AGENT_POINTER_PATH) ?? [])
      .slice(1)
      .map(Number)

    expect(x).toBeLessThan(3)
    expect(y).toBeLessThan(4)
  })
})

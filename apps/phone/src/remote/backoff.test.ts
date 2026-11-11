import { it, expect, describe } from 'vitest'

import { Backoff, classifyClose, DISPLACED_LIMIT, NETWORK_CEILING_MS } from './backoff'

describe('отступ при обрывах', () => {
  it('коды закрытия: вытеснение, отказ по существу, «позже», сеть', () => {
    expect(classifyClose(4009)).toBe('displaced')
    expect(classifyClose(4001)).toBe('fatal')
    expect(classifyClose(1013)).toBe('relay')
    expect(classifyClose(1006)).toBe('network')
  })

  it('сеть: пауза растёт до потолка, после удачи - заново', () => {
    const backoff = new Backoff(() => 0.5)
    const pauses = Array.from({ length: 12 }, () => backoff.next('network') ?? 0)

    expect(pauses[0]).toBe(1000)
    expect(pauses[1]).toBe(2000)
    expect(Math.max(...pauses)).toBe(NETWORK_CEILING_MS)

    backoff.succeeded()
    expect(backoff.next('network')).toBe(1000)
  })

  it('отказ по существу и вытеснение без конца - больше не звонить самому', () => {
    const backoff = new Backoff(() => 0.5)

    expect(backoff.next('fatal')).toBeNull()

    for (let index = 0; index < DISPLACED_LIMIT; index += 1) {
      expect(backoff.next('displaced')).not.toBeNull()
    }

    expect(backoff.next('displaced')).toBeNull()
    backoff.reset()
    expect(backoff.next('displaced')).not.toBeNull()
  })
})

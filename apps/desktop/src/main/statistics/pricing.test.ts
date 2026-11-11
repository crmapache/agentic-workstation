import { it, expect, describe } from 'vitest'

import { costOf, priceOf } from './pricing'

const tokens = (patch: Partial<Parameters<typeof costOf>[1]> = {}) => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cacheWrite1h: 0,
  fast: false,
  ...patch,
})

describe('costOf', () => {
  it('prices Opus 5.5 with five-minute and hour cache writes apart', () => {
    const cost = costOf(
      'claude-opus-5-5',
      tokens({ input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 2e6, cacheWrite1h: 1e6 }),
    )

    // 4 + 20 + 0.2 + 5 (5 мин) + 8 (час)
    expect(cost).toBeCloseTo(37.2, 6)
  })

  it('switches Haiku 5.5 to the long-prompt card above 100k input tokens', () => {
    expect(costOf('claude-haiku-5-5', tokens({ input: 100_000 }))).toBeCloseTo(0.01, 6)
    expect(costOf('claude-haiku-5-5', tokens({ input: 200_000 }))).toBeCloseTo(0.1, 6)
  })

  it('doubles fast mode', () => {
    expect(costOf('claude-opus-5-5', tokens({ output: 1e6, fast: true }))).toBeCloseTo(40, 6)
  })

  it('prices an unknown model like the current Opus', () => {
    expect(priceOf('claude-nova-9')).toEqual(priceOf('claude-opus-5-5'))
  })

  it('tells Fable 5.1 cache reads from Fable 5', () => {
    expect(priceOf('claude-fable-5-1').cacheRead).toBe(0.25)
    expect(priceOf('claude-fable-5').cacheRead).toBe(1)
    expect(priceOf('claude-sonnet-4-6').input).toBe(3)
    expect(priceOf('claude-opus-4-1').input).toBe(15)
  })
})

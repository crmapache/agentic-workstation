import { it, expect, describe } from 'vitest'

import { moonshotCostOf } from './moonshot-pricing'
import type { AnswerTokens } from './pricing'

const tokens = (patch: Partial<AnswerTokens> = {}): AnswerTokens => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cacheWrite1h: 0,
  fast: false,
  ts: Date.UTC(2026, 10, 19),
  ...patch,
})

describe('moonshotCostOf', () => {
  it('prices the Kimi Code alias for coding by K2.7 Code, a cache write at the input price', () => {
    // 0.95 + 4 + 0.19 + 0.95 (у K2 цены записи кеша нет)
    expect(
      moonshotCostOf(
        'kimi-code/kimi-for-coding',
        tokens({ input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 }),
      ),
    ).toBeCloseTo(6.09, 6)
    expect(
      moonshotCostOf('kimi-code/kimi-for-coding-highspeed', tokens({ output: 1e6 })),
    ).toBeCloseTo(8, 6)
  })

  it('prices K3 cache writes of five minutes and of an hour apart', () => {
    // Миллион на 5 минут по 3 и миллион на час по 6.
    expect(
      moonshotCostOf('kimi-code/k3', tokens({ cacheWrite: 2e6, cacheWrite1h: 1e6 })),
    ).toBeCloseTo(9, 6)
    expect(moonshotCostOf('kimi-code/k3', tokens({ input: 1e6, cacheRead: 1e6 }))).toBeCloseTo(
      3.3,
      6,
    )
  })

  it('takes K3-256k for K3 and platform names with or without the kimi- prefix', () => {
    expect(moonshotCostOf('kimi-code/k3-256k', tokens({ output: 1e6 }))).toBeCloseTo(15, 6)
    expect(moonshotCostOf('kimi-code/k3.1-pro', tokens({ input: 1e6 }))).toBeCloseTo(2, 6)
    expect(moonshotCostOf('kimi-k3.1-pro-highspeed', tokens({ output: 1e6 }))).toBeCloseTo(20, 6)
    expect(moonshotCostOf('kimi-k2.6', tokens({ cacheRead: 1e6 }))).toBeCloseTo(0.16, 6)
  })

  it('stores no cost for a model Moonshot does not sell', () => {
    expect(moonshotCostOf('__kimi_env_model__', tokens({ input: 1e6 }))).toBe(0)
    expect(moonshotCostOf('qwen3.8:latest', tokens({ input: 1e6 }))).toBe(0)
    expect(moonshotCostOf('claude-opus-4-7', tokens({ input: 1e6 }))).toBe(0)
    expect(moonshotCostOf('', tokens({ input: 1e6 }))).toBe(0)
  })
})

import { it, expect, describe } from 'vitest'

import { costOf, priceOf, answerCostOf } from './pricing'

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

describe('answerCostOf', () => {
  it('prices Codex models by the OpenAI card, fresh input apart from the cache', () => {
    // 100 тысяч свежего входа по 2, чтения кеша по 0.2 и выхода по 10 за миллион.
    expect(
      answerCostOf('codex', 'gpt-6-sol', tokens({ input: 1e5, cacheRead: 1e5, output: 1e5 })),
    ).toBeCloseTo(1.22, 6)
    expect(answerCostOf('codex', 'gpt-6-luna', tokens({ cacheWrite: 1e5 }))).toBeCloseTo(0.0125, 6)
    // Весь вход с кешем больше 272 тысяч - вся просьба по длинной карточке.
    expect(answerCostOf('codex', 'gpt-6-sol', tokens({ input: 1e5, cacheRead: 2e5 }))).toBeCloseTo(
      0.48,
      6,
    )
  })

  it('switches a Codex answer to the long card above 272k input tokens and doubles Fast', () => {
    expect(answerCostOf('codex', 'gpt-6.1-sol', tokens({ input: 272_000 }))).toBeCloseTo(0.544, 6)
    expect(answerCostOf('codex', 'gpt-6.1-sol', tokens({ input: 300_000 }))).toBeCloseTo(1.2, 6)
    expect(
      answerCostOf('codex', 'gpt-6.1-sol', tokens({ input: 300_000, fast: true })),
    ).toBeCloseTo(2.4, 6)
  })

  it('stores no cost for a Codex model or tier it does not know', () => {
    expect(answerCostOf('codex', 'gpt-5.1-codex', tokens({ input: 1e6 }))).toBe(0)
    // У GPT-5.5 Fast длинного запроса не опубликован.
    expect(answerCostOf('codex', 'gpt-5.5', tokens({ input: 300_000, fast: true }))).toBe(0)
    expect(answerCostOf('codex', 'gpt-5.5', tokens({ input: 100_000, fast: true }))).toBeCloseTo(
      1.25,
      6,
    )
  })

  it('takes the cost OpenCode stored and never prices a model by name', () => {
    expect(answerCostOf('opencode', 'claude-opus-5-5', tokens({ input: 1e6 }), 0.3)).toBe(0.3)
    expect(answerCostOf('opencode', 'qwen3-coder:30b', tokens({ input: 1e6 }))).toBe(0)
    expect(answerCostOf('claude', 'claude-opus-5-5', tokens({ input: 1e6 }), 99)).toBeCloseTo(4, 6)
  })
})

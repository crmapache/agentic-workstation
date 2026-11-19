import { it, expect, describe } from 'vitest'

import { googleCostOf } from './google-pricing'
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

/** Миллион свежего входа, чтения кеша и выхода. */
const million = { input: 1e6, cacheRead: 1e6, output: 1e6 }

describe('googleCostOf', () => {
  it('prices Gemini 3.8 Flash at any thinking level the same, fresh input apart from the cache', () => {
    // 0.75 + 0.075 + 3.75
    expect(googleCostOf('gemini-3.8-flash-low', tokens(million))).toBeCloseTo(4.575, 6)
    expect(googleCostOf('gemini-3.8-flash-high', tokens(million))).toBeCloseTo(4.575, 6)
    expect(googleCostOf('Gemini-3.8-Flash', tokens(million))).toBeCloseTo(4.575, 6)
  })

  it('takes the price of the day of the answer: the Flash offer ends with 2026 Pacific time', () => {
    const lastMinute = Date.UTC(2027, 0, 1, 7, 59)
    const newYear = Date.UTC(2027, 0, 1, 8)

    expect(googleCostOf('gemini-3.8-flash', tokens({ ...million, ts: lastMinute }))).toBeCloseTo(
      4.575,
      6,
    )
    // 1.5 + 0.15 + 7.5
    expect(googleCostOf('gemini-3.8-flash', tokens({ ...million, ts: newYear }))).toBeCloseTo(
      9.15,
      6,
    )
    expect(googleCostOf('gemini-3.6-flash', tokens({ input: 1e6, ts: newYear }))).toBeCloseTo(
      1.5,
      6,
    )
  })

  it('doubles Gemini 4 Carbon and Argon from December 2026', () => {
    const december = Date.UTC(2026, 11, 1, 8)

    expect(googleCostOf('gemini-4-carbon', tokens({ output: 1e6 }))).toBeCloseTo(10, 6)
    expect(googleCostOf('gemini-4-carbon', tokens({ output: 1e6, ts: december }))).toBeCloseTo(
      20,
      6,
    )
    expect(googleCostOf('gemini-4-argon', tokens({ input: 1e6, ts: december }))).toBeCloseTo(4, 6)
    expect(googleCostOf('gemini-4-neon', tokens({ input: 1e6, ts: december }))).toBeCloseTo(3, 6)
  })

  it('switches Gemini 3.1 Pro to the long card above 200k input tokens with the cache', () => {
    expect(googleCostOf('gemini-3.1-pro-preview', tokens({ input: 200_000 }))).toBeCloseTo(0.4, 6)
    // 100 тысяч свежего входа по 4 и 150 тысяч чтения кеша по 0.4: вся просьба по длинной.
    expect(
      googleCostOf('gemini-3.1-pro-preview-customtools', tokens({ input: 1e5, cacheRead: 1.5e5 })),
    ).toBeCloseTo(0.46, 6)
  })

  it('prices GPT-OSS by Google, with no cache discount, and a cache write at the input price', () => {
    expect(googleCostOf('gpt-oss-120b-medium', tokens({ cacheRead: 1e6 }))).toBeCloseTo(0.09, 6)
    expect(googleCostOf('gpt-oss-120b', tokens({ output: 1e6 }))).toBeCloseTo(0.36, 6)
    expect(googleCostOf('gemini-3-flash-preview', tokens({ cacheWrite: 1e6 }))).toBeCloseTo(0.5, 6)
  })

  it('stores no cost for a model it does not know or a step without a model', () => {
    expect(googleCostOf('gemini-3-pro-high', tokens(million))).toBe(0)
    expect(googleCostOf('gemini-3.8-flash-lite-tts', tokens(million))).toBe(0)
    expect(googleCostOf('', tokens(million))).toBe(0)
  })
})

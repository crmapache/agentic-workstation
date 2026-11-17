import { it, expect, describe } from 'vitest'

import { DEFAULT_GOAL } from '@shared/goals'
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@shared/time-units'

import { dayOf, limitOf, checkGap, failureGap, WAKES_PER_DAY } from './goal-clock'

const now = new Date(2026, 10, 18, 10, 0).getTime()

describe('checkGap', () => {
  it('keeps the step while things move and stretches it in quiet days, up to 6 hours', () => {
    expect(checkGap({ everyMin: 10, changedAt: now }, now)).toBe(10 * MINUTE_MS)
    expect(checkGap({ everyMin: 10, changedAt: now - DAY_MS - 1 }, now)).toBe(20 * MINUTE_MS)
    expect(checkGap({ everyMin: 10, changedAt: now - 9 * DAY_MS }, now)).toBe(40 * MINUTE_MS)
    expect(checkGap({ everyMin: 120, changedAt: now - 9 * DAY_MS }, now)).toBe(6 * HOUR_MS)
    // Модель сама просила реже потолка - так и остаётся.
    expect(checkGap({ everyMin: 12 * 60, changedAt: now - 9 * DAY_MS }, now)).toBe(12 * HOUR_MS)
  })

  it('backs off after failures', () => {
    expect(failureGap({ everyMin: 10, changedAt: now, failures: 2 }, now)).toBe(30 * MINUTE_MS)
  })
})

describe('limitOf', () => {
  const life = { checksUsd: 0, since: now, wakeDay: dayOf(now), wakesToday: 0 }

  it('ends a goal past its days and budget, and stops a loop of wakes', () => {
    expect(limitOf(DEFAULT_GOAL, { costUsd: 1 }, life, now, true)).toBeNull()
    expect(limitOf(DEFAULT_GOAL, { costUsd: 4 }, { ...life, checksUsd: 1 }, now, false)).toBe(
      'overBudget',
    )
    expect(limitOf(DEFAULT_GOAL, { costUsd: 0 }, life, now + 8 * DAY_MS, false)).toBe('expired')
    expect(
      limitOf(DEFAULT_GOAL, { costUsd: 0 }, { ...life, wakesToday: WAKES_PER_DAY }, now, true),
    ).toBe('wakeLimit')
    // Новый день - счёт пробуждений заново.
    expect(
      limitOf(
        DEFAULT_GOAL,
        { costUsd: 0 },
        { ...life, wakesToday: WAKES_PER_DAY },
        now + DAY_MS,
        true,
      ),
    ).toBeNull()
  })
})

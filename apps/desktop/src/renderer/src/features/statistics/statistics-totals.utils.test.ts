import { it, expect, describe } from 'vitest'

import type { StatsTotals } from '@shared/statistics'

import { linesOf, tokensOf } from './statistics-totals.utils'

describe('tokensOf', () => {
  it('складывает вход, выход и оба вида кеша', () => {
    expect(tokensOf({ input: 1, output: 2, cacheRead: 30, cacheWrite: 400 })).toBe(433)
  })
})

describe('linesOf', () => {
  it('изменено - добавленные и удалённые, у человека и агентов отдельно', () => {
    const totals = {
      manualLinesAdded: 3,
      manualLinesRemoved: 1,
      agentLinesAdded: 120,
      agentLinesRemoved: 40,
    } as StatsTotals

    expect(linesOf(totals)).toEqual({ you: 4, agents: 160, total: 164 })
  })
})

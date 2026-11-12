import { it, expect, describe } from 'vitest'

import type { RunSummary } from '@shared/scenario-runs'

import { pastRuns, isResumable } from './scenarios-runs.utils'

describe('run lists', () => {
  it('keeps out of the past what is still going', () => {
    const run = (id: string) => ({ id }) as RunSummary

    expect(pastRuns([run('a'), run('b')], [run('b')]).map((one) => one.id)).toEqual(['a'])
  })

  it('carries on a stopped or failed run only when its main thread got going', () => {
    expect(isResumable({ state: 'failed', headConversationId: 'h' })).toBe(true)
    expect(isResumable({ state: 'stopped', headConversationId: 'h' })).toBe(true)
    expect(isResumable({ state: 'stopped', headConversationId: '' })).toBe(false)
    expect(isResumable({ state: 'done', headConversationId: 'h' })).toBe(false)
  })
})

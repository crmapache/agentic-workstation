import { it, expect, describe } from 'vitest'

import type { Conversation } from '@shared/claude'

import { isClosableTab } from './tab-close.utils'

const blank = (change: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c',
    title: '',
    titleSource: 'default',
    outcome: 'none',
    status: 'idle',
    queue: [],
    fork: null,
    ...change,
  }) as Conversation

describe('можно ли закрыть вкладку разговора', () => {
  it('последнюю пустую - нет, среди других - да', () => {
    expect(isClosableTab(blank(), 1)).toBe(false)
    expect(isClosableTab(blank(), 2)).toBe(true)
  })

  it('последнюю, в которой что-то есть, - да', () => {
    expect(isClosableTab(blank({ outcome: 'done', title: 'Fix the bug' }), 1)).toBe(true)
    expect(isClosableTab(blank({ status: 'running' }), 1)).toBe(true)
    expect(isClosableTab(blank({ titleSource: 'user', title: 'Plan' }), 1)).toBe(true)
    expect(isClosableTab(blank({ fork: { sourceTitle: 'A' } as Conversation['fork'] }), 1)).toBe(
      true,
    )
  })
})

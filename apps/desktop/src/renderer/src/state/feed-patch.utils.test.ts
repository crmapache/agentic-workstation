import { it, expect, describe } from 'vitest'

import type { FeedItem } from '@shared/claude-feed'

import { applyFeedPatch } from './feed-patch.utils'

const text = (id: string): FeedItem => ({
  kind: 'assistant',
  id,
  parentToolUseId: null,
  text: 'hi',
  streaming: false,
})

describe('патч ленты', () => {
  it('тронутое меняется на месте, новое встаёт в конец', () => {
    const feed = {
      conversationId: 'c',
      items: [text('a'), text('b')],
      tasks: [],
      hasEarlier: false,
    }
    const next = applyFeedPatch(feed, {
      conversationId: 'c',
      upserts: [{ ...text('a'), text: 'changed' } as FeedItem, text('c')],
    })

    expect(next.items.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(next.items[0]).toMatchObject({ text: 'changed' })
    expect(next.items[1]).toBe(feed.items[1])
  })
})

import { it, expect, describe } from 'vitest'

import type { FeedItem } from '@shared/conversation-feed'

import { menuPlace, forkPointAfter } from './SelectionMenu.utils'

const user = (id: string, steering = false) =>
  ({ kind: 'user', id, steering, parentToolUseId: null }) as unknown as FeedItem
const answer = (id: string) =>
  ({ kind: 'assistant', id, parentToolUseId: null }) as unknown as FeedItem

describe('меню выделения', () => {
  it('форк - до следующего сообщения человека, посреди хода - мимо', () => {
    const items = [
      user('u1'),
      answer('a1'),
      user('s1', true),
      answer('a2'),
      user('u2'),
      answer('a3'),
    ]

    expect(forkPointAfter(items, 'a1')).toBe('u2')
    expect(forkPointAfter(items, 'group:a2')).toBe('u2')
    expect(forkPointAfter(items, 'a3')).toBeNull()
    expect(forkPointAfter(items, 'missing')).toBeNull()
  })

  it('над выделением по центру, без места сверху - под ним, у края - прижато', () => {
    const menu = { width: 100, height: 30 }

    expect(
      menuPlace({ top: 200, bottom: 220, left: 100, right: 200 }, menu, { width: 800 }, 6),
    ).toEqual({
      left: 100,
      top: 164,
    })
    expect(menuPlace({ top: 10, bottom: 30, left: 0, right: 20 }, menu, { width: 800 }, 6)).toEqual(
      {
        left: 6,
        top: 36,
      },
    )
  })
})

import { it, expect, describe } from 'vitest'

import type { ClosedTab } from './closed-tabs'
import { takeClosed, isWorthKeeping, rememberClosed, CLOSED_TABS_MAX } from './closed-tabs'
import type { StoredConversation } from './panel-state'

const stored = (id: string, extra: Partial<StoredConversation> = {}): StoredConversation => ({
  id,
  projectPath: '/p',
  sessionId: `s-${id}`,
  title: '',
  model: null,
  effort: null,
  permissionMode: 'default',
  queue: [],
  fork: null,
  updatedAt: 0,
  ...extra,
})

const closed = (id: string, closedAt = 0): ClosedTab => ({
  stored: stored(id, { title: id, titleSource: 'llm', outcome: 'done' }),
  place: { groupsLeft: [], tabsLeft: [] },
  closedAt,
  hasDraft: false,
})

describe('закрытые вкладки', () => {
  it('пустая «New chat» не помнится, разговор, имя, очередь и черновик - помнятся', () => {
    expect(isWorthKeeping(stored('a'), false)).toBe(false)
    expect(isWorthKeeping(stored('a'), true)).toBe(true)
    expect(isWorthKeeping(stored('a', { outcome: 'done' }), false)).toBe(true)
    expect(isWorthKeeping(stored('a', { titleSource: 'user', title: 'X' }), false)).toBe(true)
    expect(
      isWorthKeeping(
        stored('a', { queue: [{ id: 'q', text: 't', imageCount: 0, draft: null }] }),
        false,
      ),
    ).toBe(true)
  })

  it('последняя закрытая - первой, повтор не задваивается, сверх двадцати - уходят', () => {
    let list: ClosedTab[] = []

    for (let index = 0; index < CLOSED_TABS_MAX + 3; index += 1) {
      list = rememberClosed(list, closed(`t${index}`, index))
    }

    list = rememberClosed(list, closed('t21', 99))

    expect(list).toHaveLength(CLOSED_TABS_MAX)
    expect(list[0]?.closedAt).toBe(99)
    expect(list.filter((item) => item.stored.id === 't21')).toHaveLength(1)
  })

  it('уже открытая снова пропускается и выбрасывается', () => {
    const list = [closed('a'), closed('b'), closed('c')]
    const { tab, rest } = takeClosed(list, null, (id) => id === 'a')

    expect(tab?.stored.id).toBe('b')
    expect(rest.map((item) => item.stored.id)).toEqual(['c'])
    expect(takeClosed(list, 'c', () => false).tab?.stored.id).toBe('c')
  })
})

import { it, expect, describe } from 'vitest'

import {
  emptyState,
  orphanTabs,
  agentTraces,
  emptyChannel,
  restoredGroups,
  parseAgentState,
} from './agent-state.utils'

describe('вкладки агента, о которых IDE больше не знает', () => {
  const channel = {
    tabs: {
      '1': { groupId: 7, url: 'https://a/', generation: 0 },
      '2': { groupId: 7, url: 'https://b/', generation: 0 },
      '3': { groupId: 7, url: 'https://c/', generation: 0 },
      '4': { groupId: 7, url: 'https://d/', generation: 1 },
      '5': { groupId: 7, url: 'https://e/', generation: 0 },
    },
    groups: { '7': 'AW · web' },
  }

  it('прежние связи, не в сводке: в группе - закрыть, вытащенную человеком - только отпустить', () => {
    // 2 IDE держит; 3 человек вытащил из группы; 4 открыта уже этой связью; 5 закрыта.
    const live = new Map([
      [1, 7],
      [2, 7],
      [3, -1],
      [4, 7],
    ])

    expect(orphanTabs(channel, new Set([2]), 1, live)).toEqual([
      { tabId: 1, close: true },
      { tabId: 3, close: false },
    ])
  })

  it('IDE не вернулась: все её вкладки, какой бы связи они ни были', () => {
    const live = new Map([
      [1, 7],
      [4, 7],
    ])

    expect(
      orphanTabs(channel, new Set(), Number.POSITIVE_INFINITY, live).map((item) => item.tabId),
    ).toEqual([1, 4])
  })
})

describe('после перезапуска Chrome', () => {
  it('группы агента узнаются по оранжевому цвету и имени прошлого запуска', () => {
    expect(
      restoredGroups(
        [
          { id: 1, title: 'AW · web', color: 'orange' },
          { id: 2, title: 'AW · web', color: 'blue' },
          { id: 3, title: 'Work', color: 'orange' },
        ],
        new Set(['AW · web']),
      ),
    ).toEqual([1])
  })

  it('следы агента - имена групп и адреса вкладок обеих IDE', () => {
    const state = emptyState()

    state.dev.tabs['5'] = { groupId: 2, url: 'https://x/', generation: 0 }
    state.dev.groups['2'] = 'AW · app'
    state.installed.groups['9'] = 'AW · site'

    expect(agentTraces(state)).toEqual({
      titles: new Set(['AW · app', 'AW · site']),
      urls: new Set(['https://x/']),
    })
  })
})

describe('состояние из хранилища', () => {
  it('битое и чужое - пустое, а не исключение', () => {
    expect(parseAgentState(undefined)).toEqual(emptyState())
    expect(parseAgentState({ dev: 'x', installed: { tabs: null } })).toEqual({
      installed: emptyChannel(),
      dev: emptyChannel(),
    })
  })
})

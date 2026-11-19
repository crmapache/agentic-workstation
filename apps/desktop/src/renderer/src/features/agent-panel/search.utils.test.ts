import { it, expect, describe } from 'vitest'

import type { SearchHit } from '@shared/claude-search'
import type { FeedItem } from '@shared/conversation-feed'

import { useSearchStore } from './search.store'
import {
  chatHits,
  rowForHit,
  groupByChat,
  snippetPieces,
  searchTabOfKey,
  searchTabBeside,
} from './search.utils'

const hit = (overrides: Partial<SearchHit>): SearchHit => ({
  conversationId: 'c1',
  uuid: 'u1',
  anchor: 'u1',
  speaker: 'you',
  at: 0,
  title: 'A talk',
  titleSource: 'heuristic',
  messages: 0,
  snippet: '',
  spans: [],
  text: '',
  truncated: false,
  length: 0,
  ...overrides,
})

describe('кусок находки режется на закрашенное и нет', () => {
  it('красит по местам, которые измерил главный процесс', () => {
    expect(snippetPieces('why the balance is hidden', [[8, 15]])).toEqual([
      { text: 'why the ', hit: false },
      { text: 'balance', hit: true },
      { text: ' is hidden', hit: false },
    ])
  })

  it('места, которые не помещаются, не красят чепуху', () => {
    expect(snippetPieces('short', [[3, 40]])).toEqual([{ text: 'short', hit: false }])
    expect(
      snippetPieces('ab', [
        [1, 2],
        [0, 1],
      ]),
    ).toEqual([
      { text: 'a', hit: false },
      { text: 'b', hit: true },
    ])
  })
})

describe('находки группируются по разговорам', () => {
  it('порядок - как пришли, у групп и у строк; заголовок - последний раз, когда говорили', () => {
    const groups = groupByChat([
      hit({ uuid: 'a', conversationId: 'c1', title: 'One', at: 10, messages: 4 }),
      hit({ uuid: 'x', conversationId: 'c2', title: 'Two', at: 5 }),
      hit({ uuid: 'b', conversationId: 'c1', title: 'One', at: 30 }),
    ])

    expect(groups.map((group) => group.conversationId)).toEqual(['c1', 'c2'])
    expect(groups[0]?.hits.map((one) => one.uuid)).toEqual(['a', 'b'])
    expect(groups[0]).toMatchObject({ messages: 4, at: 30 })
    expect(groupByChat([])).toEqual([])
  })
})

describe('стрелки капсулы ходят по одному разговору', () => {
  it('только этот разговор, в порядке сообщений в нём, список не трогается', () => {
    const hits = [
      hit({ conversationId: 'c2', uuid: 'other', at: 50 }),
      hit({ conversationId: 'c1', uuid: 'late', at: 300 }),
      hit({ conversationId: 'c1', uuid: 'early', at: 100 }),
    ]

    expect(chatHits(hits, 'c1').map((one) => one.uuid)).toEqual(['early', 'late'])
    expect(hits.map((one) => one.uuid)).toEqual(['other', 'late', 'early'])
  })

  it('без времени - в порядке, в каком нашлись', () => {
    const hits = [hit({ uuid: 'first' }), hit({ uuid: 'second' }), hit({ uuid: 'timed', at: 5 })]

    expect(chatHits(hits, 'c1').map((one) => one.uuid)).toEqual(['first', 'second', 'timed'])
  })
})

describe('находка ищется в ленте', () => {
  const items = [
    {
      kind: 'user',
      id: 'u1',
      parentToolUseId: null,
      text: 'why',
      time: 0,
      images: [],
      steering: false,
    },
    { kind: 'assistant', id: 'msg_1:1', parentToolUseId: null, text: 'because', streaming: false },
    {
      kind: 'thinking',
      id: 'msg_1:0',
      parentToolUseId: null,
      text: '',
      streaming: false,
      tokens: 0,
    },
  ] satisfies FeedItem[]

  it('по месту в ленте, у ответа - по номеру блока', () => {
    expect(rowForHit(items, hit({ uuid: 'a1', anchor: 'msg_1:1', speaker: 'claude' }))).toBe(
      'msg_1:1',
    )
    expect(rowForHit(items, hit({ uuid: 'u1', anchor: 'u1' }))).toBe('u1')
    expect(rowForHit(items, hit({ uuid: 'x', anchor: 'msg_1:0' }))).toBeUndefined()
    expect(rowForHit(items, hit({ uuid: 'gone', anchor: 'gone' }))).toBeUndefined()
  })
})

describe('клавиши окна', () => {
  it('соседняя вкладка - по кругу в обе стороны', () => {
    expect(searchTabBeside('chat', 1)).toBe('project')
    expect(searchTabBeside('ai', 1)).toBe('chat')
    expect(searchTabBeside('chat', -1)).toBe('ai')
  })

  it('цифра - по месту клавиши, и в ряду, и на цифровом блоке, не дальше третьей', () => {
    expect(['Digit1', 'Digit2', 'Digit3'].map(searchTabOfKey)).toEqual(['chat', 'project', 'ai'])
    expect(searchTabOfKey('Numpad2')).toBe('project')
    expect(searchTabOfKey('Digit4')).toBeUndefined()
    expect(searchTabOfKey('KeyC')).toBeUndefined()
  })
})

describe('капсула и прыжок', () => {
  it('стрелки ходят по кругу, лента говорит, дошла ли', () => {
    const hits = [hit({ uuid: 'a', at: 1 }), hit({ uuid: 'b', at: 2 }), hit({ uuid: 'c', at: 3 })]
    const store = useSearchStore.getState()

    store.showHit('tab-1', hits[1] as SearchHit, hits, [])
    expect(useSearchStore.getState().capsule).toMatchObject({ at: 1, note: 'loading' })

    useSearchStore.getState().stepHit(1)
    useSearchStore.getState().stepHit(1)
    expect(useSearchStore.getState().capsule?.at).toBe(0)
    expect(useSearchStore.getState().focus?.hit.uuid).toBe('a')

    const nonce = useSearchStore.getState().focus?.nonce ?? 0

    useSearchStore.getState().landHit(nonce - 1, 'missing')
    expect(useSearchStore.getState().capsule?.note).toBe('loading')
    useSearchStore.getState().landHit(nonce, 'none')
    expect(useSearchStore.getState()).toMatchObject({ focus: null, capsule: { note: 'none' } })

    useSearchStore.getState().resetSearch()
    expect(useSearchStore.getState().capsule).toBeNull()
  })

  it('ответ отменённого прогона модели не ложится', () => {
    const { startAi } = useSearchStore.getState()

    startAi('r1')
    startAi('r2')
    useSearchStore.getState().finishAi('r1', { status: 'found', hits: [hit({})] })
    expect(useSearchStore.getState().ai).toMatchObject({ runId: 'r2', hits: [] })

    useSearchStore.getState().finishAi('r2', { status: 'found', hits: [hit({})] })
    expect(useSearchStore.getState().ai).toMatchObject({ runId: null, answered: true })
    useSearchStore.getState().resetSearch()
  })
})

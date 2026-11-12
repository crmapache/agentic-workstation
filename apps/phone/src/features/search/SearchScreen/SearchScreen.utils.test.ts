import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import { summaryOf, snippetPieces } from './SearchScreen.utils'

const t = ((key: string, values: Record<string, unknown> = {}) =>
  `${key}${JSON.stringify(values)}`) as unknown as TFunction

describe('кусок найденного сообщения', () => {
  it('найденные слова - отдельно, текст между ними - как был', () => {
    expect(snippetPieces('fix the login bug', [[8, 13]])).toEqual([
      { text: 'fix the ', hit: false },
      { text: 'login', hit: true },
      { text: ' bug', hit: false },
    ])
    expect(
      snippetPieces('ab', [
        [0, 1],
        [1, 2],
      ]),
    ).toEqual([
      { text: 'a', hit: true },
      { text: 'b', hit: true },
    ])
  })

  it('кривые пары пропускаются, текст не теряется', () => {
    const pieces = snippetPieces('hello world', [
      [6, 11],
      [2, 4],
      [3, 3],
      [9, 40],
    ])

    expect(pieces.map((piece) => piece.text).join('')).toBe('hello world')
    expect(pieces.filter((piece) => piece.hit).map((piece) => piece.text)).toEqual(['world'])
    expect(snippetPieces('', [])).toEqual([])
  })

  it('итог строкой: сколько из скольких, или почему модель ничего не дала', () => {
    const hit = {
      sessionId: 's',
      anchor: 'a',
      speaker: 'you' as const,
      at: 0,
      title: '',
      messages: 2,
      snippet: 'x',
      spans: [],
    }

    expect(
      summaryOf(t, {
        kind: 'words',
        data: { hits: [hit], total: 3, conversations: 2, failed: false },
      }),
    ).toBe(
      'search.results{"count":3} search.inConversations{"count":2} · search.showing{"shown":1}',
    )
    expect(
      summaryOf(t, {
        kind: 'ai',
        data: { status: 'failed', reason: 'timeout', detail: '' },
      }),
    ).toContain('search.aiFailures.timeout')
    expect(summaryOf(t, { kind: 'ai', data: { status: 'found', hits: [] } })).toBe(
      'search.aiNothing{}',
    )
  })
})

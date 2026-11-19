import { it, expect, describe } from 'vitest'

import type { FeedItem } from '@shared/conversation-feed'

import { turnSummary } from './turn-summary'

const user = (id: string, text: string): FeedItem => ({
  id,
  parentToolUseId: null,
  kind: 'user',
  text,
  time: 0,
  images: [],
  steering: false,
})

const said = (id: string, text: string, parent: string | null = null): FeedItem => ({
  id,
  parentToolUseId: parent,
  kind: 'assistant',
  text,
  streaming: false,
})

describe('turnSummary', () => {
  it('берёт последний ответ главного агента после последнего сообщения и правки итога хода', () => {
    const items = [
      user('u1', 'first'),
      said('a1', 'old answer'),
      user('u2', 'second'),
      said('a2', 'thinking aloud'),
      said('s1', 'subagent words', 'tool-1'),
      said('a3', 'final answer'),
      {
        id: 't1',
        parentToolUseId: null,
        kind: 'turn',
        durationMs: 1200,
        costUsd: 0.02,
        isError: false,
        interrupted: false,
        changes: [{ path: '/p/a.ts', added: 1, removed: 0, created: false, counted: true }],
        revertable: false,
      } as unknown as FeedItem,
    ]

    expect(turnSummary(items)).toEqual({
      answer: 'final answer',
      changedFiles: ['/p/a.ts'],
      durationMs: 1200,
      costUsd: 0.02,
    })
  })

  it('пустая лента - пустая сводка', () => {
    expect(turnSummary([])).toEqual({
      answer: '',
      changedFiles: [],
      durationMs: null,
      costUsd: null,
    })
  })
})

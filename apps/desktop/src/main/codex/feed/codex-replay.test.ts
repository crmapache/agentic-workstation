import { it, expect, describe } from 'vitest'

import type { CodexTurn } from '../catalog/catalog-shapes'
import { CodexFeedSync } from '../conversation/codex-feed'
import { editorNote } from '../../agents/conversation/editor-note'
import { replayTurns } from './codex-replay'

const turn = (id: string, startedAt: number, items: CodexTurn['items']): CodexTurn => ({
  id,
  items,
  status: 'completed',
  error: '',
  startedAt,
  completedAt: startedAt + 5000,
})

const said = (id: string, clientId: string, text: string) => ({
  type: 'userMessage',
  id,
  clientId,
  content: [{ type: 'text', text, text_elements: [] }],
})

const answer = (id: string, text: string) => ({ type: 'agentMessage', id, text })

describe('прошлые ходы Codex в ленте', () => {
  it('сообщение под своим id панели, «!» карточкой перед ним, заметка о редакторе строкой', () => {
    const { items, log } = replayTurns(
      [
        turn('t1', 1000, [
          {
            type: 'userMessage',
            id: 'u1',
            clientId: 'c1',
            content: [
              {
                type: 'text',
                text: '<bash-input>ls</bash-input>\n<bash-stdout>a.ts</bash-stdout>\n\nfix it',
                text_elements: [],
              },
              {
                type: 'text',
                text: editorNote({ path: '/p/a.ts', name: 'a.ts', from: 2, to: 3, text: 'x' }),
                text_elements: [],
              },
            ],
          },
          answer('m1', 'Done.'),
        ]),
      ],
      'p1-',
      () => '',
    )

    expect(items.map((item) => item.kind)).toEqual(['shell', 'user', 'assistant', 'turn'])
    expect(items[0]).toMatchObject({ id: 'c1:shell:0', command: 'ls', stdout: 'a.ts' })
    expect(items[1]).toMatchObject({
      id: 'c1',
      text: 'fix it',
      time: 1000,
      editor: { path: '/p/a.ts', name: 'a.ts', from: 2, to: 3 },
    })
    expect(items[3]).toMatchObject({ id: 'p1-turn-1', durationMs: 5000, interrupted: false })
    expect(log).toEqual([{ turnId: 't1', messageId: 'c1' }])
  })

  it('навык - снова «/имя» в начале сообщения, и без слов после него тоже', () => {
    const skill = { type: 'skill', name: 'use-railway', path: '/s/SKILL.md' }
    const { items } = replayTurns(
      [
        turn('t1', 1000, [
          {
            type: 'userMessage',
            id: 'u1',
            clientId: 'c1',
            content: [skill, { type: 'text', text: 'deploy it', text_elements: [] }],
          },
        ]),
        turn('t2', 2000, [{ type: 'userMessage', id: 'u2', clientId: 'c2', content: [skill] }]),
      ],
      'p1-',
      () => '',
    )

    expect(items.filter((item) => item.kind === 'user').map((item) => item.text)).toEqual([
      '/use-railway deploy it',
      '/use-railway',
    ])
  })

  it('ход, оставшийся идущим, - прерванный', () => {
    const { items } = replayTurns(
      [{ ...turn('t1', 1000, [said('u1', 'c1', 'go')]), status: 'inProgress' }],
      'p1-',
      () => '',
    )

    expect(items.at(-1)).toMatchObject({ kind: 'turn', interrupted: true })
  })

  it('лента: последняя страница при открытии, ранняя - перед ней по «раньше»', async () => {
    const pages: Record<string, { turns: CodexTurn[]; nextCursor: string | null }> = {
      last: { turns: [turn('t2', 2000, [said('u2', 'c2', 'second')])], nextCursor: 'older' },
      older: { turns: [turn('t1', 1000, [said('u1', 'c1', 'first')])], nextCursor: null },
    }
    const feed = new CodexFeedSync(
      'conv',
      () => undefined,
      () => '',
      {
        threadId: () => 'thread',
        fork: () => null,
        turns: (_threadId, cursor) => Promise.resolve(pages[cursor ?? 'last'] ?? pages['older']!),
      },
    )

    await feed.ensureLoaded()
    expect(feed.snapshot()).toMatchObject({ hasEarlier: true })
    expect(
      feed
        .snapshot()
        .items.filter((item) => item.kind === 'user')
        .map((item) => item.id),
    ).toEqual(['c2'])

    const all = await feed.loadEarlier()

    expect(all.hasEarlier).toBe(false)
    expect(all.items.filter((item) => item.kind === 'user').map((item) => item.id)).toEqual([
      'c1',
      'c2',
    ])
  })

  it('форк: шов после последнего унаследованного хода; журнал ходов - для отката', async () => {
    const feed = new CodexFeedSync(
      'conv',
      () => undefined,
      () => '',
      {
        threadId: () => 'fork',
        fork: () => ({ sourceSessionId: 'src', sourceTitle: 'Source', at: 't1' }),
        turns: () =>
          Promise.resolve({
            turns: [
              turn('t2', 2000, [said('u2', 'c2', 'mine')]),
              turn('t1', 1000, [said('u1', 'c1', 'old')]),
            ],
            nextCursor: null,
          }),
      },
    )

    await feed.ensureLoaded()

    const kinds = feed
      .snapshot()
      .items.map((item) => (item.kind === 'notice' ? item.code : item.kind))

    expect(kinds).toEqual(['user', 'turn', 'forked', 'user', 'turn'])
    expect(feed.turns.turnBefore('c2')).toBe('t1')
    expect(feed.turns.turnBefore('c1')).toBeNull()
    expect(feed.turns.turnOf('c2')).toBe('t2')
  })

  it('неродившийся форк показывает источник до своей точки, новее - не его', async () => {
    const asked: string[] = []
    const feed = new CodexFeedSync(
      'conv',
      () => undefined,
      () => '',
      {
        threadId: () => '',
        fork: () => ({ sourceSessionId: 'src', sourceTitle: 'Source', at: 't1' }),
        turns: (threadId) => {
          asked.push(threadId)

          return Promise.resolve({
            turns: [
              turn('t2', 2000, [said('u2', 'c2', 'later')]),
              turn('t1', 1000, [said('u1', 'c1', 'kept')]),
            ],
            nextCursor: null,
          })
        },
      },
    )

    await feed.ensureLoaded()

    expect(asked).toEqual(['src'])
    expect(
      feed.snapshot().items.map((item) => (item.kind === 'notice' ? item.code : item.kind)),
    ).toEqual(['user', 'turn', 'forked'])
  })
})

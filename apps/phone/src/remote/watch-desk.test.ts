import { it, expect, describe } from 'vitest'

import type {
  FeedPatchMessage,
  FeedSnapshotMessage,
} from '@agentic-workstation/remote-protocol/agent-messages'
import type { FeedView } from '@agentic-workstation/remote-protocol/feed'

import { WatchDesk } from './watch-desk'

const AGENT = 'agent'

const item = (id: string, text = id) => ({ id, kind: 'assistant', text })

const snapshot = (seq = 3): FeedSnapshotMessage => ({
  p: 1,
  k: 'feed',
  conversationId: 'c1',
  epoch: 'e1',
  seq,
  items: [item('u1'), item('a1')],
  tasks: [],
  hasEarlier: false,
})

const patch = (seq: number, over: Partial<FeedPatchMessage> = {}): FeedPatchMessage => ({
  p: 1,
  k: 'patch',
  conversationId: 'c1',
  epoch: 'e1',
  seq,
  upserts: [],
  ...over,
})

const desk = (now = { value: 0 }) => {
  const sent: object[] = []
  const views: FeedView[] = []
  const watches = new WatchDesk({
    send: (_agentId, message) => sent.push(message),
    feedChanged: (_agentId, view) => views.push(view),
    now: () => now.value,
  })

  return { watches, sent, views, now }
}

describe('подписки и ленты телефона', () => {
  it('подписка считается по экранам: отписка - когда ушёл последний', () => {
    const { watches, sent } = desk()
    const first = watches.watch(AGENT, { kind: 'queues', scope: '*' })
    const second = watches.watch(AGENT, { kind: 'queues', scope: '*' })

    first()
    first()
    expect(sent).toEqual([{ p: 1, k: 'subscribe', projectKey: '*' }])
    second()
    expect(sent.at(-1)).toEqual({ p: 1, k: 'unsubscribe', projectKey: '*' })
  })

  it('снимок, заплатки по порядку, известный элемент меняется на месте', () => {
    const { watches, views } = desk()

    watches.snapshot(AGENT, snapshot())
    watches.patch(AGENT, patch(4, { upserts: [item('a1', 'edited'), item('a2')] }))
    watches.patch(AGENT, patch(5, { removes: ['u1'] }))

    expect(views.at(-1)?.items).toEqual([item('a1', 'edited'), item('a2')])
    expect(views.at(-1)?.seq).toBe(5)
  })

  it('уже применённая заплатка не меняет ничего', () => {
    const { watches, views } = desk()

    watches.snapshot(AGENT, snapshot())
    watches.patch(AGENT, patch(3, { upserts: [item('x')] }))

    expect(views).toHaveLength(1)
  })

  it('дыра в номерах - подписка заново со своего номера и жизни IDE, не чаще раза в 2 с', () => {
    const { watches, sent, now } = desk()

    watches.watch(AGENT, { kind: 'conversation', conversationId: 'c1' })
    watches.snapshot(AGENT, snapshot())
    sent.length = 0
    watches.patch(AGENT, patch(6, { upserts: [item('late')] }))
    watches.patch(AGENT, patch(7, { upserts: [item('later')] }))

    expect(sent).toEqual([{ p: 1, k: 'subscribe', conversationId: 'c1', since: 3, epoch: 'e1' }])

    now.value = 2500
    watches.patch(AGENT, patch(8))
    expect(sent).toHaveLength(2)
  })

  it('новая линия: всё, что смотрим, - заново, разговор - с номером', () => {
    const { watches, sent } = desk()

    watches.watch(AGENT, { kind: 'conversation', conversationId: 'c1' })
    watches.watch(AGENT, { kind: 'run', runId: 'r1' })
    watches.snapshot(AGENT, snapshot())
    sent.length = 0
    watches.resubscribeAll(AGENT)

    expect(sent).toEqual([
      { p: 1, k: 'subscribe', conversationId: 'c1', since: 3, epoch: 'e1' },
      { p: 1, k: 'subscribe', runId: 'r1' },
    ])
  })

  it('другая жизнь IDE (epoch) - не заплатка, а повод переспросить', () => {
    const { watches, sent, views } = desk()

    watches.watch(AGENT, { kind: 'conversation', conversationId: 'c1' })
    watches.snapshot(AGENT, snapshot())
    sent.length = 0
    watches.patch(AGENT, patch(4, { epoch: 'e2', upserts: [item('x')] }))

    expect(views).toHaveLength(1)
    expect(sent).toHaveLength(1)
  })

  it('подписка каждого вида - одна: новая заменяет прежнюю, отпустить заменённую - ничего не снять', () => {
    const { watches, sent } = desk()
    const first = watches.watch(AGENT, { kind: 'conversation', conversationId: 'c1' })
    const run = watches.watch(AGENT, { kind: 'run', runId: 'r1' })

    watches.watch(AGENT, { kind: 'conversation', conversationId: 'c2' })
    sent.length = 0
    // Экран прежнего разговора ушёл позже, чем открылся новый: отписка сняла бы c2 у IDE.
    first()
    expect(sent).toEqual([])

    // Новая линия: по одной подписке каждого вида, а не все, что когда-то были.
    watches.resubscribeAll(AGENT)
    expect(sent).toEqual([
      { p: 1, k: 'subscribe', conversationId: 'c2' },
      { p: 1, k: 'subscribe', runId: 'r1' },
    ])
    run()
    expect(sent.at(-1)).toEqual({ p: 1, k: 'unsubscribe', runId: 'r1' })
  })

  it('снимок без подписки (проснулся, журнал ушёл дальше) заменяет ленту, заплатки - от него', () => {
    const { watches, views } = desk()

    watches.snapshot(AGENT, snapshot())
    watches.patch(AGENT, patch(4, { upserts: [item('a2')] }))
    // IDE прислала снимок сама: номер дальше, лента целиком другая.
    watches.snapshot(AGENT, { ...snapshot(40), items: [item('n1')] })
    watches.patch(AGENT, patch(41, { upserts: [item('n2')] }))

    expect(views.at(-1)?.items.map((one) => one.id)).toEqual(['n1', 'n2'])
    expect(views.at(-1)?.seq).toBe(41)
  })
})

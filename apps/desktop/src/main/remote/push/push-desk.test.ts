import { it, expect, describe, afterEach } from 'vitest'

import type { Conversation, PendingRequest } from '@shared/claude'
import type { ScenarioQueuesView } from '@shared/scenario-queues'

import type { PushNotice } from '@agentic-workstation/remote-protocol/push'

import { QUEUE, fakeIde, PERMISSION, conversationOf } from '../__fixtures__/fake-ide'
import { AWAKE_MS } from '../agent/remote-agent'
import { ProjectKeys } from '../bridge/project-keys'
import { machineRoots, pathRedactor } from '../bridge/redact'
import { PushDesk, COALESCE_MS, PUSHES_PER_MINUTE } from './push-desk'

const PHONE = 'P'.repeat(22)

const desks: PushDesk[] = []

afterEach(() => {
  for (const desk of desks.splice(0)) desk.stop()
})

/** Стол пушей на подделке IDE: часы, кто когда говорил и что ушло - руками теста. */
const setup = (conversations: Conversation[] = [conversationOf()]) => {
  const ide = fakeIde()
  const clock = { now: 1_000_000 }
  const heard = new Map<string, number>()
  const subscribers = new Set([PHONE])
  const sent: { deviceId: string; notice: PushNotice }[] = []
  const state = { conversations }
  const queues: ScenarioQueuesView = { queues: [QUEUE], live: [] }
  const desk = new PushDesk({
    conversations: () => state.conversations,
    queues: () => queues,
    lens: () => ({
      keys: new ProjectKeys(ide.workspace),
      redact: pathRedactor(machineRoots(ide.workspace, queues, '/Users/someone')),
    }),
    subscribers: () => [...subscribers],
    heardAt: (deviceId) => heard.get(deviceId) ?? 0,
    send: (deviceId, notice) => {
      sent.push({ deviceId, notice })

      return true
    },
    now: () => clock.now,
  })
  /** Разговор (первый по умолчанию) теперь такой. */
  const set = (over: Partial<Conversation>, index = 0) => {
    state.conversations = state.conversations.map((one, at) =>
      at === index ? { ...one, ...over } : one,
    )
  }
  const ask = (pending: PendingRequest, index = 0) => set({ pending, status: 'waiting' }, index)
  /** Время идёт, и стол смотрит снова. */
  const later = (ms: number) => {
    clock.now += ms
    desk.evaluate()
  }

  desks.push(desk)

  return { desk, clock, heard, subscribers, sent, state, queues, set, ask, later }
}

const permission = (requestId: string): PendingRequest => ({ ...PERMISSION, requestId })

describe('когда будить телефон', () => {
  it('что ждало до начала линии, не будит; новое при телефоне не на связи - один пуш', () => {
    const { ask, sent, later } = setup([conversationOf({ pending: PERMISSION })])

    later(1000)
    expect(sent).toEqual([])

    ask(permission('perm-2'))
    later(10)
    later(10)

    expect(sent).toHaveLength(1)
    expect(sent[0]?.notice).toMatchObject({
      p: 1,
      reason: 'permission',
      project: 'secret-client',
      tool: 'Bash',
      tag: `c-${conversationOf().id}`,
    })
  })

  it('телефон на связи и заговорил после вопроса - видел сам, пуша нет', () => {
    const { ask, sent, later, heard, clock } = setup()

    heard.set(PHONE, clock.now)
    ask(permission('perm-2'))
    later(10)
    later(5000)
    heard.set(PHONE, clock.now)
    later(AWAKE_MS + 1000)

    expect(sent).toEqual([])
  })

  it('экран погас: телефон молчит дольше «на связи» - будим, не раньше', () => {
    const { ask, sent, later, heard, clock } = setup()

    heard.set(PHONE, clock.now)
    later(5000)
    ask(permission('perm-2'))
    later(10)
    expect(sent).toEqual([])

    later(AWAKE_MS)
    expect(sent.map((one) => one.notice.reason)).toEqual(['permission'])
  })

  it('один повод разговора - не чаще раза в минуту: новый ждёт и уходит, если ещё стоит', () => {
    const { ask, set, sent, later } = setup()

    ask(permission('perm-2'))
    later(10)
    set({ pending: null, status: 'running' })
    later(10)
    ask(permission('perm-3'))
    later(10_000)
    expect(sent).toHaveLength(1)

    later(COALESCE_MS)
    expect(sent).toHaveLength(2)

    // А решённый за эту минуту - не уходит вовсе.
    set({ pending: null, status: 'running' })
    later(10)
    ask(permission('perm-4'))
    later(10)
    set({ pending: null, status: 'idle' })
    later(COALESCE_MS + 10)
    expect(sent).toHaveLength(2)
  })

  it('из нескольких поводов одного разговора уходит важнейший, остальные сказаны с ним', () => {
    const { desk, ask, sent, later, clock } = setup()

    ask(permission('perm-2'))
    desk.called({ conversationId: conversationOf().id, reason: 'trouble', at: clock.now })
    later(10)
    later(COALESCE_MS * 2)

    expect(sent.map((one) => one.notice.reason)).toEqual(['trouble'])
  })

  it('разные разговоры будят порознь, но телефону - не больше предела в минуту', () => {
    const many = Array.from({ length: PUSHES_PER_MINUTE + 3 }, (_, index) =>
      conversationOf({ id: `conv-${index}` }),
    )
    const { ask, sent, later } = setup(many)

    many.forEach((_, index) => ask(permission(`perm-${index}`), index))
    later(10)
    expect(sent).toHaveLength(PUSHES_PER_MINUTE)
    expect(new Set(sent.map((one) => one.notice.tag)).size).toBe(PUSHES_PER_MINUTE)

    later(60_000)
    expect(sent).toHaveLength(PUSHES_PER_MINUTE + 3)
  })

  it('очередь встала после старта линии - пуш экраном очереди; встала до - нет', () => {
    const { queues, sent, later, clock } = setup([])

    queues.queues = [{ ...QUEUE, hold: { reason: 'failed', itemId: 'i1', at: clock.now - 1 } }]
    later(10)
    expect(sent).toEqual([])

    queues.queues = [{ ...QUEUE, hold: { reason: 'stopAfter', itemId: 'i1', at: clock.now } }]
    later(10)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.notice).toMatchObject({
      reason: 'held',
      detail: 'stopAfter',
      route: { screen: 'queue', queueId: 'q1' },
    })
  })

  it('новая подписка - новая точка отсчёта; отпущенный и без подписки не будятся', () => {
    const { desk, ask, sent, later, subscribers } = setup()

    ask(permission('perm-2'))
    later(10)
    desk.subscribed(PHONE, true)
    later(COALESCE_MS * 2)
    expect(sent).toHaveLength(1)

    desk.subscribed(PHONE, true)
    ask(permission('perm-3'))
    later(10)
    expect(sent).toHaveLength(2)

    desk.forget(PHONE)
    subscribers.clear()
    ask(permission('perm-4'))
    later(COALESCE_MS * 2)
    expect(sent).toHaveLength(2)
  })
})

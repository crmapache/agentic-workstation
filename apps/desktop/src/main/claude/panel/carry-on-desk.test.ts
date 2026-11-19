import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import type { Conversation } from '@shared/conversation'

import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import type { Outgoing } from '../../agents/conversation/outbox'
import { CarryOnDesk } from './carry-on-desk'
import { owedFor } from './carry-ons'

const NOW = 1_000_000_000

/** Вкладка ровно с тем, что продолжению нужно: поля, лента, очередь, отправка. */
const fakeRuntime = (change: { isFree?: boolean; spoken?: boolean } = {}) => {
  const sent: Outgoing[] = []
  const released: number[] = []
  const runtime = {
    meta: { id: 'tab' } as Conversation,
    accountId: 'acc-a',
    isDisposed: false,
    isFree: change.isFree ?? true,
    feed: {
      builder: {
        hasBackgroundWork: false,
        items: change.spoken === false ? [] : [{ kind: 'user' }],
      },
    },
    outbox: { release: () => released.push(1) },
    update(next: Partial<Conversation>) {
      runtime.meta = { ...runtime.meta, ...next }
    },
    send: (message: Outgoing) => {
      sent.push(message)

      return Promise.resolve()
    },
  }

  return { runtime, asRuntime: runtime as unknown as ConversationRuntime, sent, released }
}

const deskFor = (runtime: ConversationRuntime, refused: Map<string, number> = new Map()) =>
  new CarryOnDesk({
    runtimeOf: () => runtime,
    refusedUntil: (account) => refused.get(account) ?? null,
    noteRefusal: (account, until) =>
      until ? refused.set(account, until) : refused.delete(account),
    noteAnswered: (account) => refused.delete(account),
  })

/** Строки, как их пишет CLI: стоп лимита с его сбросом и заглушка отказа. */
const limitEvent = (resetsAtSeconds: number) => ({
  type: 'rate_limit_event',
  rate_limit_info: { status: 'rejected', resetsAt: resetsAtSeconds, rateLimitType: 'five_hour' },
})
const refusal = { type: 'assistant', error: 'rate_limit', message: { content: [] } }
const errorResult = { type: 'result', is_error: true, num_turns: 1, result: 'limit' }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('продолжение после лимита: путь целиком', () => {
  it('отказ лимита - план на экране, в момент сброса - слова панели с тегом', () => {
    const { runtime, asRuntime, sent } = fakeRuntime()
    const desk = deskFor(asRuntime)
    const reset = NOW + 60 * 60_000

    desk.observe(asRuntime, limitEvent(reset / 1000))
    desk.observe(asRuntime, refusal)
    desk.afterResult(asRuntime, errorResult, NOW)

    expect(runtime.meta.carryOn).toEqual({ until: reset + 30_000, guess: false })
    expect(sent).toEqual([])

    vi.advanceTimersByTime(60 * 60_000 + 30_000)

    expect(sent).toHaveLength(1)
    expect(sent[0]?.auto).toBe('limit')
    expect(sent[0]?.text).toMatch(/^<panel-carry-on reason="limit">.*has reset/)
    expect(runtime.meta.carryOn).toBeUndefined()
  })

  it("«Don't continue» снимает слова, а очередь уходит в момент сброса", () => {
    const { asRuntime, sent, released } = fakeRuntime()
    const desk = deskFor(asRuntime)

    desk.observe(asRuntime, refusal)
    desk.afterResult(asRuntime, errorResult, NOW)
    desk.cancel('tab')
    vi.advanceTimersByTime(16 * 60_000)

    expect(sent).toEqual([])
    expect(released).toHaveLength(1)
  })

  it('сообщение человека снимает долг', () => {
    const { runtime, asRuntime, sent } = fakeRuntime()
    const desk = deskFor(asRuntime)

    desk.observe(asRuntime, refusal)
    desk.afterResult(asRuntime, errorResult, NOW)
    desk.drop('tab')
    vi.advanceTimersByTime(16 * 60_000)

    expect(sent).toEqual([])
    expect(runtime.meta.carryOn).toBeUndefined()
  })
})

describe('продолжение после смены аккаунта', () => {
  it('сразу по концу прерванного хода, словами о переезде', () => {
    const { asRuntime, sent } = fakeRuntime()
    const desk = deskFor(asRuntime)

    desk.owe('tab', owedFor('accountSwitch'))
    desk.afterResult(asRuntime, { type: 'result', num_turns: 1, result: '' }, NOW)

    expect(sent[0]?.auto).toBe('accountSwitch')
    expect(sent[0]?.text).toContain('automatic switch to another account')
  })

  it('занятая вкладка ждёт; пустой разговор не продолжают', () => {
    const busy = fakeRuntime({ isFree: false })
    const empty = fakeRuntime({ spoken: false })

    deskFor(busy.asRuntime).owe('tab', owedFor('accountSwitch'))
    deskFor(busy.asRuntime).sayNext(busy.asRuntime, NOW)

    const desk = deskFor(empty.asRuntime)

    desk.owe('tab', owedFor('accountSwitch'))
    desk.sayNext(empty.asRuntime, NOW)

    expect(busy.sent).toEqual([])
    expect(empty.sent).toEqual([])
  })

  it('ожидание лимита переезжает на аккаунт без отказа - продолжает сразу', () => {
    const { asRuntime, sent } = fakeRuntime()
    const desk = deskFor(asRuntime)

    desk.observe(asRuntime, refusal)
    desk.afterResult(asRuntime, errorResult, NOW)
    desk.followAccount('tab', 'acc-b', NOW)
    desk.sayNext(asRuntime, NOW)

    expect(sent[0]?.text).toContain('moved to another account')
  })
})

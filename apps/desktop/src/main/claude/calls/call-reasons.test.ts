import { it, vi, expect, describe, afterEach } from 'vitest'

import type { ConversationCall } from '@shared/claude-prefs'

import {
  callForResult,
  strongestCall,
  callForRateLimit,
  callForAssistantError,
} from './call-reasons'
import { CALL_SETTLE_MS } from './calls.constants'
import { ConversationCalls } from './conversation-calls'

const result = (fields: Record<string, unknown>) => ({ type: 'result', ...fields })
const live = { interrupted: false, stillWorking: false }
const NOW = 1_700_000_000_000

const limitEvent = (info: Record<string, unknown>) => ({
  type: 'rate_limit_event',
  rate_limit_info: { rateLimitType: 'five_hour', resetsAt: NOW / 1000 + 3600, ...info },
})

describe('повод позвать по концу хода', () => {
  it('ход кончился сам - «ход закончен»', () => {
    expect(callForResult(result({ is_error: false }), live)).toBe('turnDone')
  })

  it('остановил человек - звать не о чем', () => {
    expect(callForResult(result({ is_error: true }), { ...live, interrupted: true })).toBeNull()
  })

  it('фоновый субагент ещё работает - это не конец работы', () => {
    expect(callForResult(result({}), { ...live, stillWorking: true })).toBeNull()
  })

  it('отказ: по лимиту - «лимит», иначе - «сломалось», даже пока работают субагенты', () => {
    const limit = result({ is_error: true, result: 'Claude AI usage limit reached|1700' })
    const tooMany = result({ is_error: true, result: 'boom', api_error_status: 429 })
    const broken = result({ is_error: true, result: 'API Error: 500' })

    expect(callForResult(limit, live)).toBe('limit')
    expect(callForResult(tooMany, live)).toBe('limit')
    expect(callForResult(broken, { ...live, stillWorking: true })).toBe('error')
  })

  it('ошибка ответа модели: лимит или поломка', () => {
    expect(callForAssistantError('rate_limit')).toBe('limit')
    expect(callForAssistantError('authentication_failed')).toBe('error')
    expect(callForAssistantError('')).toBeNull()
  })
})

describe('событие лимита', () => {
  it('работа идёт - звать не о чем', () => {
    expect(callForRateLimit(limitEvent({ status: 'allowed_warning' }), NOW)).toBeNull()
    expect(
      callForRateLimit(limitEvent({ status: 'rejected', rateLimitGraceActive: true }), NOW),
    ).toBeNull()
  })

  it('сброс уже прошёл - сигнал устарел', () => {
    const stale = limitEvent({ status: 'rejected', resetsAt: NOW / 1000 - 10 })

    expect(callForRateLimit(stale, NOW)).toBeNull()
  })

  it('доплата - свой повод, остановка до сброса - «лимит»; ключ - окно и его сброс', () => {
    const extra = callForRateLimit(limitEvent({ status: 'rejected', isUsingOverage: true }), NOW)
    const stop = callForRateLimit(limitEvent({ status: 'rejected' }), NOW)

    expect(extra?.reason).toBe('extraUsage')
    expect(stop?.reason).toBe('limit')
    expect(stop?.key).not.toBe(extra?.key)
  })
})

describe('кто из поводов зовёт', () => {
  it('самый важный из собранных', () => {
    expect(strongestCall(new Set(['turnDone', 'error']))).toBe('error')
    expect(strongestCall(new Set(['plan', 'permission']))).toBe('permission')
    expect(strongestCall(new Set())).toBeNull()
  })
})

describe('поводы по вкладкам', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const collect = (muted: string[] = []) => {
    const calls: ConversationCall[] = []
    const observed: ConversationCall[] = []
    const tracker = new ConversationCalls(
      () => muted as ConversationCall['reason'][],
      (call) => calls.push(call),
      (call) => observed.push(call),
    )

    return { calls, observed, tracker }
  }

  it('за такт вкладка зовёт одним, самым важным поводом', () => {
    vi.useFakeTimers()

    const { calls, tracker } = collect()

    tracker.add('a', 'turnDone')
    tracker.add('a', 'error')
    tracker.add('b', 'question')
    vi.advanceTimersByTime(CALL_SETTLE_MS)

    expect(calls).toEqual([
      { conversationId: 'a', reason: 'error' },
      { conversationId: 'b', reason: 'question' },
    ])
  })

  it('выключенный повод не зовёт - ни звуком, ни свечением, а телефону слышен', () => {
    vi.useFakeTimers()

    const { calls, observed, tracker } = collect(['error'])

    tracker.add('a', 'error')
    vi.advanceTimersByTime(CALL_SETTLE_MS)

    expect(calls).toEqual([])
    expect(observed).toEqual([{ conversationId: 'a', reason: 'error' }])
  })

  it('повторный лимит того же окна зовёт один раз', () => {
    vi.useFakeTimers()

    const { calls, tracker } = collect()

    tracker.add('a', 'limit', 'limit:five_hour:1')
    vi.advanceTimersByTime(CALL_SETTLE_MS)
    tracker.add('a', 'limit', 'limit:five_hour:1')
    vi.advanceTimersByTime(CALL_SETTLE_MS)
    tracker.add('a', 'limit', 'limit:five_hour:2')
    vi.advanceTimersByTime(CALL_SETTLE_MS)

    expect(calls).toHaveLength(2)
  })
})

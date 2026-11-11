import { it, expect, describe } from 'vitest'

import { isPresent, PRESENCE_IDLE_MS } from './presence.utils'

describe('присутствие человека', () => {
  const now = 1_000_000_000

  it('ввод был недавно и окно в фокусе - минута идёт', () => {
    expect(isPresent(now, now - 10_000, true)).toBe(true)
    expect(isPresent(now, now - PRESENCE_IDLE_MS, true)).toBe(true)
  })

  it('окно не в фокусе - минуты нет, даже со свежим вводом', () => {
    expect(isPresent(now, now - 1_000, false)).toBe(false)
  })

  it('без ввода дольше трёх минут и без ввода вовсе - минуты нет', () => {
    expect(isPresent(now, now - PRESENCE_IDLE_MS - 1, true)).toBe(false)
    expect(isPresent(now, 0, true)).toBe(false)
  })
})

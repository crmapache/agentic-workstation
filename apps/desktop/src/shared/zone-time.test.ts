import { it, expect, describe } from 'vitest'

import { isTimeZone, wallTimeToUtc } from './zone-time'

describe('wall time to UTC', () => {
  it('reads wall time in the given zone, not the machine zone', () => {
    expect(wallTimeToUtc('2026-11-24T09:30', 'America/Costa_Rica')).toBe(
      Date.UTC(2026, 10, 24, 15, 30),
    )
    expect(wallTimeToUtc('2026-11-24T09:30', 'Europe/Madrid')).toBe(Date.UTC(2026, 10, 24, 8, 30))
  })

  it('takes a date as local midnight', () => {
    expect(wallTimeToUtc('2026-07-01', 'Europe/Madrid')).toBe(Date.UTC(2026, 5, 30, 22))
  })

  it('keeps the right offset on clock change days', () => {
    // 29 марта 2026 в Мадриде стрелки ушли вперёд в 02:00: утро - уже летнее время.
    expect(wallTimeToUtc('2026-03-29T09:00', 'Europe/Madrid')).toBe(Date.UTC(2026, 2, 29, 7))
    // Часа 02:30 в этот день нет - на час позже, как у календарей.
    expect(wallTimeToUtc('2026-03-29T02:30', 'Europe/Madrid')).toBe(Date.UTC(2026, 2, 29, 1, 30))
    // 25 октября стрелки ушли назад: вечер - уже зимнее время.
    expect(wallTimeToUtc('2026-10-25T18:00', 'Europe/Madrid')).toBe(Date.UTC(2026, 9, 25, 17))
  })

  it('refuses what is not a wall time', () => {
    expect(wallTimeToUtc('2026-02-30T10:00', 'UTC')).toBeNull()
    expect(wallTimeToUtc('2026-11-24T25:00', 'UTC')).toBeNull()
    expect(wallTimeToUtc('2026-11-24T10:00Z', 'UTC')).toBeNull()
    expect(wallTimeToUtc('tomorrow', 'UTC')).toBeNull()
  })
})

describe('time zone names', () => {
  it('knows IANA zones and nothing else', () => {
    expect(isTimeZone('Europe/Madrid')).toBe(true)
    expect(isTimeZone('Pacific Standard Time')).toBe(false)
    expect(isTimeZone('')).toBe(false)
  })
})

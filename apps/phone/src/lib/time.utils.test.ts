import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import { sinceText, durationText } from './time.utils'

/** Подстановка вместо i18next: ключ и значения - видно, какая ветка сработала. */
const t = ((key: string, values: Record<string, unknown> = {}) =>
  `${key}${JSON.stringify(values)}`) as unknown as TFunction

describe('время коротко', () => {
  it('секунды, минуты с секундами, часы, дни', () => {
    expect(durationText(t, 40_000)).toBe('time.seconds{"count":40}')
    expect(durationText(t, 160_000)).toBe('time.minutesSeconds{"minutes":2,"seconds":40}')
    expect(durationText(t, 15 * 60_000)).toBe('time.minutes{"count":15}')
    expect(durationText(t, 65 * 60_000)).toBe('time.hoursMinutes{"hours":1,"minutes":5}')
    expect(durationText(t, 26 * 3_600_000)).toBe('time.daysHours{"days":1,"hours":2}')
  })

  it('отрицательное (часы разошлись) - ноль, а не «-3s»', () => {
    expect(durationText(t, -3000)).toBe('time.seconds{"count":0}')
  })

  it('с какого времени - с поправкой на часы IDE', () => {
    // Часы IDE на минуту впереди: на телефоне 10:00, в IDE 10:01, событие - в 10:00 по IDE.
    expect(sinceText(t, 1_000_000, 1_000_000, 60_000)).toBe('time.minutes{"count":1}')
    expect(sinceText(t, 1_000_000, 1_010_000, 0)).toBe('time.justNow{}')
  })

  it('дольше недели - дата, а не сотни дней', () => {
    expect(sinceText(t, 0, 30 * 24 * 3_600_000, 0)).not.toContain('time.')
  })
})

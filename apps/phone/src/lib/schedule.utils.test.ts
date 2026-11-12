import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import { atText, atFromText, scheduleText } from './schedule.utils'

const t = ((key: string, options?: { time?: string }) =>
  `${key}@${options?.time ?? ''}`) as unknown as TFunction

describe('час отложенного запуска', () => {
  it('минуты от полуночи и поле времени сходятся', () => {
    expect(atText(0)).toBe('00:00')
    expect(atText(9 * 60 + 5)).toBe('09:05')
    expect(atText(24 * 60 - 1)).toBe('23:59')
    expect(atFromText('09:05')).toBe(545)
    expect(atFromText('23:59:00')).toBe(1439)
    expect(atFromText(atText(777))).toBe(777)
  })

  it('не время - null, а не полночь', () => {
    expect(atFromText('')).toBeNull()
    expect(atFromText('24:00')).toBeNull()
    expect(atFromText('9:75')).toBeNull()
    expect(atFromText('soon')).toBeNull()
  })

  it('ритм словами: еженедельный - по дню недели', () => {
    expect(scheduleText(t, { at: 540, repeat: 'daily', weekday: 1 })).toBe(
      'schedule.repeatAt.daily@09:00',
    )
    expect(scheduleText(t, { at: 540, repeat: 'weekly', weekday: 3 })).toBe(
      'schedule.weeklyAt.3@09:00',
    )
  })
})

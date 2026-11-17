import { it, expect, describe } from 'vitest'

import type { TaskSchedule } from '@shared/tasks'

import { dayKey, formOf, clockOf, scheduleOf, scheduleWords } from './tasks.utils'

const schedule = (patch: Partial<TaskSchedule>): TaskSchedule => ({
  repeat: 'daily',
  at: 9 * 60,
  days: [],
  monthDay: 1,
  date: '',
  ...patch,
})

const names = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const words = (patch: Partial<TaskSchedule>) =>
  scheduleWords(
    schedule(patch),
    (day) => names[day] ?? '',
    () => 'Tue, Dec 1',
  )

describe('scheduleWords', () => {
  it('names each rhythm', () => {
    expect(words({ repeat: 'manual' }).key).toBe('manual')
    expect(words({ repeat: 'hourly', at: 15 })).toMatchObject({
      key: 'hourly',
      values: { minute: '15' },
    })
    expect(words({ repeat: 'monthly', monthDay: 1 })).toMatchObject({
      key: 'monthly',
      values: { time: '09:00', day: '1' },
    })
    expect(words({ repeat: 'monthly', monthDay: 31 }).key).toBe('monthlyLast')
    expect(words({ repeat: 'once', date: '2026-12-01' }).values).toMatchObject({
      date: 'Tue, Dec 1',
      time: '09:00',
    })
  })

  it('calls weekdays and all days by their names', () => {
    expect(words({ repeat: 'weekly', days: [1, 2, 3, 4, 5] }).key).toBe('weekdays')
    expect(words({ repeat: 'weekly', days: [] }).key).toBe('everyDay')
    expect(words({ repeat: 'weekly', days: [1, 3] })).toMatchObject({
      key: 'weekly',
      values: { time: '09:00', days: 'Mon, Wed' },
    })
  })
})

describe('form day', () => {
  it('keeps the one-off day through the form', () => {
    const now = new Date(2026, 10, 16, 12).getTime()
    const form = formOf(schedule({ repeat: 'once', date: '2026-12-01' }), now)

    expect(dayKey(form.day)).toBe('2026-12-01')
    expect(scheduleOf(form).date).toBe('2026-12-01')
    expect(dayKey(formOf(schedule({}), now).day)).toBe('2026-11-17')
    expect(clockOf(9 * 60 + 5)).toBe('09:05')
  })
})

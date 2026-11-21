import { it, expect, describe } from 'vitest'

import {
  everyOf,
  menuRule,
  presetOf,
  sameRepeat,
  autoRunHint,
  presetRepeat,
  startWeekdays,
} from './CardModal.utils'

describe('пресеты повтора', () => {
  it('правило пресета от дня срока и пресет обратно', () => {
    // 20 ноября 2026 - пятница.
    expect(presetRepeat('weekly', '2026-11-20')).toEqual({
      every: 1,
      unit: 'week',
      weekdays: [5],
      start: '2026-11-20',
      fromDone: false,
    })
    expect(presetOf(presetRepeat('weekdays', '2026-11-20'), '2026-11-23')).toBe('weekdays')
    expect(presetOf(presetRepeat('monthly', '2026-11-20'), '2026-11-20')).toBe('monthly')
    // Месяц от другого числа - уже не «Every month on the 23rd» этого срока.
    expect(presetOf(presetRepeat('monthly', '2026-11-20'), '2026-11-23')).toBeNull()
    expect(presetOf({ ...presetRepeat('daily', '2026-11-20'), every: 2 }, '2026-11-20')).toBeNull()
    // «Каждый понедельник» с началом в среду - всё ещё недельный пресет, а не своё правило.
    expect(presetOf({ ...presetRepeat('weekly', '2026-11-18'), weekdays: [1] }, '2026-11-18')).toBe(
      'weekly',
    )
  })

  it('одно ли правило и дни недели начала', () => {
    expect(
      sameRepeat(presetRepeat('daily', '2026-11-20'), presetRepeat('daily', '2026-12-01')),
    ).toBe(true)
    expect(
      sameRepeat(presetRepeat('yearly', '2026-11-20'), presetRepeat('yearly', '2026-12-01')),
    ).toBe(false)
    expect(startWeekdays(presetRepeat('daily', '2026-11-22'))).toEqual([7])
  })

  it('пункт текущего пресета держит начало правила, а не число нынешнего срока', () => {
    const on31st = presetRepeat('monthly', '2027-01-31')
    const kept = { preset: 'monthly' as const, repeat: on31st }

    // Срок уехал на 28 февраля: «тот же» пункт меню - всё ещё правило на 31-е.
    expect(menuRule('monthly', kept, '2027-02-28')).toBe(on31st)
    expect(menuRule('yearly', kept, '2027-02-28').start).toBe('2027-02-28')
  })

  it('каждые N из поля', () => {
    expect(['3', ' 12 ', '0', '1.5', 'x', '1000'].map(everyOf)).toEqual([
      3,
      12,
      null,
      null,
      null,
      null,
    ])
  })

  it('подсказка запуска в срок по порядку важности', () => {
    const base = { hasDue: true, failed: false, done: false, sent: false, passed: false }

    expect(autoRunHint({ ...base, hasDue: false, failed: true })).toBe('needsDue')
    expect(autoRunHint({ ...base, failed: true, done: true })).toBe('failed')
    expect(autoRunHint({ ...base, done: true, passed: true })).toBe('done')
    expect(autoRunHint({ ...base, sent: true, passed: true })).toBe('sent')
    expect(autoRunHint({ ...base, passed: true })).toBe('passed')
    expect(autoRunHint(base)).toBe('hint')
  })
})

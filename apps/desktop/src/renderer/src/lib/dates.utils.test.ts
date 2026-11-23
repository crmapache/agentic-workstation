import { it, expect, describe } from 'vitest'

import {
  isoDay,
  waitClock,
  momentLabel,
  nearDayLabel,
  ordinalLabel,
  monthDayLabel,
  clockOfMinutes,
  dayHeadingLabel,
} from './dates.utils'

const WORDS = { today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday' }

/** Пятница, 20 ноября 2026, полдень: от неё считаются ближние дни. */
const NOW = new Date(2026, 10, 20, 12).getTime()

const at = (day: number, hours = 9, minutes = 0) =>
  new Date(2026, 10, day, hours, minutes).getTime()

describe('часы ожидания', () => {
  it('минуты и секунды, часы - только когда дошло до них', () => {
    expect(waitClock(0)).toBe('0:00')
    expect(waitClock(42_400)).toBe('0:42')
    expect(waitClock(12 * 60_000 + 5_000)).toBe('12:05')
    expect(waitClock(3_723_000)).toBe('1:02:03')
  })

  it('часы, отстающие от начала, не уходят в минус', () => {
    expect(waitClock(-500)).toBe('0:00')
  })
})

describe('день и час строкой', () => {
  it('местный день - YYYY-MM-DD с нулями', () => {
    expect(isoDay(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05')
    expect(isoDay(at(20))).toBe('2026-11-20')
  })

  it('минуты от полуночи - HH:MM, вне суток - к краю', () => {
    expect(clockOfMinutes(9 * 60 + 5)).toBe('09:05')
    expect(clockOfMinutes(0)).toBe('00:00')
    expect(clockOfMinutes(24 * 60)).toBe('23:59')
    expect(clockOfMinutes(-10)).toBe('00:00')
  })
})

describe('ближние дни словами', () => {
  it('сегодня, завтра, вчера - словами окна, неделя - днём, дальше - датой', () => {
    expect(nearDayLabel(at(20), NOW, WORDS)).toBe('Today')
    expect(nearDayLabel(at(21), NOW, WORDS)).toBe('Tomorrow')
    expect(nearDayLabel(at(19), NOW, WORDS)).toBe('Yesterday')
    expect(nearDayLabel(at(24), NOW, WORDS)).toBe('Tue')
    expect(nearDayLabel(at(14), NOW, WORDS)).toBe('Sat')
    expect(nearDayLabel(at(27), NOW, WORDS)).toBe('Fri, Nov 27')
  })

  it('заголовок дня - ближние словами, остальные датой с днём недели, чужой год - с годом', () => {
    expect(dayHeadingLabel(at(20, 23), NOW, WORDS)).toBe('Today')
    expect(dayHeadingLabel(at(19, 0, 5), NOW, WORDS)).toBe('Yesterday')
    expect(dayHeadingLabel(at(18), NOW, WORDS)).toBe('Wed, Nov 18')
    expect(dayHeadingLabel(new Date(2025, 11, 30).getTime(), NOW, WORDS)).toBe('Tue, Dec 30, 2025')
  })

  it('момент - тот же день и час; полная дата отделяет час запятой', () => {
    expect(momentLabel(at(20, 9, 5), NOW, WORDS)).toBe('Today 09:05')
    expect(momentLabel(at(21, 18), NOW, WORDS)).toBe('Tomorrow 18:00')
    expect(momentLabel(at(24, 7, 30), NOW, WORDS)).toBe('Tue 07:30')
    expect(momentLabel(at(27, 9), NOW, WORDS)).toBe('Fri, Nov 27, 09:00')
  })
})

describe('числа и дни повтора', () => {
  it('число месяца словом и день года', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinalLabel)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '31st',
    ])
    expect(monthDayLabel(at(21))).toBe('Nov 21')
  })
})

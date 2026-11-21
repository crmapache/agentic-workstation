import { it, expect, describe } from 'vitest'

import type { TrackerRepeat } from './tracker'
import { dayNumber, weekdayOf, fitsRepeat, nextRepeat, firstRepeat } from './tracker-repeat'

/** Местное время этой машины: 16 ноября 2026 - понедельник. */
const at = (date: string, clock = '12:00') => {
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = clock.split(':').map(Number)

  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, hours, minutes).getTime()
}

const rule = (patch: Partial<TrackerRepeat>): TrackerRepeat => ({
  every: 1,
  unit: 'day',
  weekdays: [],
  start: '2026-11-01',
  fromDone: false,
  ...patch,
})

/** Цепочка сроков: каждый следующий - отметка «сделано» в день срока. */
const chain = (repeat: TrackerRepeat, from: string, steps: number) => {
  const dates = [from]

  for (let step = 0; step < steps; step += 1) {
    const last = dates[dates.length - 1] ?? from

    dates.push(nextRepeat(repeat, { date: last, time: null }, at(last)).date)
  }

  return dates.slice(1)
}

describe('следующий срок', () => {
  it('каждый день: сделано в срок - завтра; просрочено - сегодня, как в Todoist', () => {
    const daily = rule({})

    expect(nextRepeat(daily, { date: '2026-11-16', time: null }, at('2026-11-16'))).toEqual({
      date: '2026-11-17',
      time: null,
    })
    expect(nextRepeat(daily, { date: '2026-11-13', time: null }, at('2026-11-16')).date).toBe(
      '2026-11-16',
    )
  })

  it('время суток, которое сегодня уже прошло, уводит на завтра', () => {
    const daily = rule({})
    const late = { date: '2026-11-14', time: '09:00' }

    expect(nextRepeat(daily, late, at('2026-11-16', '15:00'))).toEqual({
      date: '2026-11-17',
      time: '09:00',
    })
    expect(nextRepeat(daily, late, at('2026-11-16', '08:00')).date).toBe('2026-11-16')
  })

  it('каждые три дня держат шаг от начала, а не от разового переноса', () => {
    const every3 = rule({ every: 3, start: '2026-11-01' })

    expect(chain(every3, '2026-11-01', 3)).toEqual(['2026-11-04', '2026-11-07', '2026-11-10'])
    // Срок разово перенесли на 5-е: следующий - снова по шагу от 1-го.
    expect(nextRepeat(every3, { date: '2026-11-05', time: null }, at('2026-11-05')).date).toBe(
      '2026-11-07',
    )
  })

  it('по дням недели и раз в две недели', () => {
    const monThu = rule({ unit: 'week', weekdays: [1, 4], start: '2026-11-16' })

    expect(chain(monThu, '2026-11-16', 4)).toEqual([
      '2026-11-19',
      '2026-11-23',
      '2026-11-26',
      '2026-11-30',
    ])

    const fortnight = rule({ unit: 'week', every: 2, weekdays: [1], start: '2026-11-09' })

    expect(chain(fortnight, '2026-11-09', 2)).toEqual(['2026-11-23', '2026-12-07'])
    // Разовый перенос на четверг той же недели - следующий срок по своей чётности недель.
    expect(nextRepeat(fortnight, { date: '2026-11-12', time: null }, at('2026-11-12')).date).toBe(
      '2026-11-23',
    )
  })

  it('раз в две недели считаются от первого дня правила, а не от недели начала', () => {
    // Воскресенье 22 ноября: «каждый второй понедельник» начинается 23-го.
    const fortnight = rule({ unit: 'week', every: 2, weekdays: [1], start: '2026-11-22' })

    expect(firstRepeat(fortnight, '2026-11-22')).toBe('2026-11-23')
    expect(chain(fortnight, '2026-11-23', 2)).toEqual(['2026-12-07', '2026-12-21'])
  })

  it('31-е в коротком месяце - последний день, но правило не сползает', () => {
    const monthly = rule({ unit: 'month', start: '2027-01-31' })

    expect(chain(monthly, '2027-01-31', 4)).toEqual([
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
      '2027-05-31',
    ])
  })

  it('29 февраля раз в год - 28-го в обычный год и снова 29-го в високосный', () => {
    const yearly = rule({ unit: 'year', start: '2028-02-29' })

    expect(chain(yearly, '2028-02-29', 4)).toEqual([
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ])
  })

  it('от выполнения - от сегодняшнего дня, а не от срока', () => {
    const afterDone = rule({ every: 3, fromDone: true })

    expect(nextRepeat(afterDone, { date: '2026-11-01', time: '10:00' }, at('2026-11-10'))).toEqual({
      date: '2026-11-13',
      time: '10:00',
    })

    const monthly = rule({ unit: 'month', fromDone: true })

    expect(nextRepeat(monthly, { date: '2027-01-01', time: null }, at('2027-01-31')).date).toBe(
      '2027-02-28',
    )
  })
})

describe('день правила', () => {
  it('первый день не раньше даты и подходит ли дата', () => {
    const mondays = rule({ unit: 'week', weekdays: [1], start: '2026-11-18' })

    expect(firstRepeat(mondays, '2026-11-18')).toBe('2026-11-23')
    expect(fitsRepeat(mondays, '2026-11-23')).toBe(true)
    expect(fitsRepeat(mondays, '2026-11-24')).toBe(false)
    expect(fitsRepeat(rule({ fromDone: true, unit: 'week' }), '2026-11-24')).toBe(true)
  })

  it('день недели и разбор даты', () => {
    expect(weekdayOf(dayNumber('2026-11-16') ?? 0)).toBe(1)
    expect(weekdayOf(dayNumber('2026-11-22') ?? 0)).toBe(7)
    expect(weekdayOf(dayNumber('1969-12-29') ?? 0)).toBe(1)
    expect(dayNumber('2026-02-30')).toBeNull()
    expect(dayNumber('20261116')).toBeNull()
  })
})

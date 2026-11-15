import { it, expect, describe } from 'vitest'

import type { StatsReport } from '@shared/statistics'

import {
  addDays,
  deltaOf,
  rangeOf,
  startOfDay,
  hasEarlierOf,
  compareMomentOf,
  pickedLastDayOf,
  steppedLastDayOf,
  isHumanComparable,
  comparablePeriodOf,
} from './statistics-period.utils'

const at = (text: string) => new Date(text).getTime()

describe('rangeOf', () => {
  const now = at('2026-11-10T15:20:00')

  it('день - сутки целиком, до следующей полуночи', () => {
    expect(rangeOf('day', now, null)).toEqual({
      period: { from: at('2026-11-10T00:00:00'), to: at('2026-11-11T00:00:00') },
      today: at('2026-11-10T00:00:00'),
      lastDay: at('2026-11-10T00:00:00'),
    })
  })

  it('7 и 30 дней - по последний день включительно', () => {
    expect(rangeOf('week', now, null).period.from).toBe(at('2026-11-04T00:00:00'))
    expect(rangeOf('month', now, null).period.from).toBe(at('2026-10-12T00:00:00'))
    expect(rangeOf('week', now, at('2026-11-01T00:00:00')).period).toEqual({
      from: at('2026-10-26T00:00:00'),
      to: at('2026-11-02T00:00:00'),
    })
  })

  it('выбранный день не позже сегодня, всё время его не замечает', () => {
    expect(rangeOf('day', now, at('2026-11-12T00:00:00')).lastDay).toBe(at('2026-11-10T00:00:00'))
    expect(rangeOf('all', now, at('2026-11-01T00:00:00')).period).toEqual({
      from: 0,
      to: at('2026-11-11T00:00:00'),
    })
  })
})

describe('steppedLastDayOf, pickedLastDayOf и hasEarlierOf', () => {
  const now = at('2026-11-10T15:20:00')

  it('стрелки шагают на длину периода', () => {
    const range = rangeOf('week', now, at('2026-11-01T00:00:00'))

    expect(steppedLastDayOf('week', range, -1)).toBe(at('2026-10-25T00:00:00'))
    expect(steppedLastDayOf('day', rangeOf('day', now, null), -1)).toBe(at('2026-11-09T00:00:00'))
  })

  it('дошли до сегодня или дальше - снова по сегодня', () => {
    expect(steppedLastDayOf('week', rangeOf('week', now, at('2026-11-05T00:00:00')), 1)).toBeNull()
    expect(steppedLastDayOf('day', rangeOf('day', now, at('2026-11-09T00:00:00')), 1)).toBeNull()
  })

  it('день из календаря: сегодня - null, прошлый - его полночь', () => {
    expect(pickedLastDayOf(at('2026-11-10T00:00:00'), at('2026-11-10T00:00:00'))).toBeNull()
    expect(pickedLastDayOf(at('2026-11-03T12:00:00'), at('2026-11-10T00:00:00'))).toBe(
      at('2026-11-03T00:00:00'),
    )
  })

  it('назад есть куда, только если данные начались раньше периода', () => {
    const range = rangeOf('day', now, null)

    expect(hasEarlierOf(range, at('2026-11-02T09:00:00'))).toBe(true)
    expect(hasEarlierOf(range, at('2026-11-10T09:00:00'))).toBe(false)
    expect(hasEarlierOf(range, null)).toBe(false)
  })
})

describe('startOfDay и addDays', () => {
  it('местная полночь и сдвиг календарём', () => {
    expect(startOfDay(at('2026-11-10T23:59:59'))).toBe(at('2026-11-10T00:00:00'))
    expect(addDays(at('2026-11-10T00:00:00'), -10)).toBe(at('2026-10-31T00:00:00'))
  })
})

describe('comparablePeriodOf', () => {
  it('сегодня сравнивается со вчера до того же часа', () => {
    const { period } = rangeOf('day', at('2026-11-10T15:20:00'), null)

    expect(comparablePeriodOf(period, at('2026-11-10T15:20:00'))).toEqual({
      from: at('2026-11-09T00:00:00'),
      to: at('2026-11-09T15:20:00'),
    })
  })

  it('«сейчас» за концом периода - прошлый период целиком', () => {
    const period = { from: 1000, to: 2000 }

    expect(comparablePeriodOf(period, 5000)).toEqual({ from: 0, to: 1000 })
  })

  it('шаг «сейчас» - несколько минут, ключ запроса не меняется каждую секунду', () => {
    expect(compareMomentOf(at('2026-11-10T15:23:41'))).toBe(at('2026-11-10T15:20:00'))
  })
})

describe('isHumanComparable', () => {
  const report = (humanDataStart: number | null, previous: boolean) =>
    ({
      period: { from: 2000, to: 3000 },
      humanDataStart,
      previous: previous ? {} : null,
    }) as unknown as StatsReport

  it('прошлый период целиком после начала данных о человеке - сравниваем', () => {
    expect(isHumanComparable(report(1000, true))).toBe(true)
  })

  it('данные о человеке начались позже начала прошлого периода - нет', () => {
    expect(isHumanComparable(report(1500, true))).toBe(false)
    expect(isHumanComparable(report(null, true))).toBe(false)
    expect(isHumanComparable(report(0, false))).toBe(false)
  })
})

describe('deltaOf', () => {
  it('рост и падение в процентах', () => {
    expect(deltaOf(150, 100)).toEqual({ direction: 'up', percent: 50 })
    expect(deltaOf(50, 100)).toEqual({ direction: 'down', percent: -50 })
  })

  it('почти без изменений - на месте, а не «+0%»', () => {
    expect(deltaOf(1001, 1000)).toEqual({ direction: 'flat', percent: 0 })
  })

  it('было ноль - «новое», без процента от нуля', () => {
    expect(deltaOf(5, 0)).toEqual({ direction: 'up', percent: null })
  })

  it('сравнения нет или оба нуля - сказать нечего', () => {
    expect(deltaOf(5, null)).toBeNull()
    expect(deltaOf(0, 0)).toBeNull()
  })
})

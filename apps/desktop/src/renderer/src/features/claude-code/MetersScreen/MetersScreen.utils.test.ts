import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import { TODAY_TOKENS_METER } from '@shared/claude-prefs'
import type { UsageWindow, AccountUsage } from '@shared/claude-usage'

import { toggleMeter, meterChoices } from './MetersScreen.utils'

const t = ((key: string) => key) as unknown as TFunction

const window = (group: string, model = ''): UsageWindow => ({
  group,
  model,
  percent: 10,
  resetsAt: null,
  severity: '',
})

const usage = (windows: UsageWindow[]): AccountUsage => ({ windows, extra: null, fetchedAt: 0 })

describe('экран Usage meters', () => {
  it('строки - окна аккаунта по порядку и токены за день последними', () => {
    const keys = meterChoices(
      usage([window('session'), window('weekly'), window('weekly', 'Fable')]),
      t,
    ).map((choice) => choice.key)

    expect(keys).toEqual(['session', 'weekly', 'weekly:Fable', TODAY_TOKENS_METER])
  })

  it('окно, названное сервером дважды, - одной строкой', () => {
    const keys = meterChoices(usage([window('weekly'), window('weekly')]), t).map(
      (choice) => choice.key,
    )

    expect(keys).toEqual(['weekly', TODAY_TOKENS_METER])
  })

  it('лимитов нет - остаются токены', () => {
    expect(meterChoices(undefined, t).map((choice) => choice.key)).toEqual([TODAY_TOKENS_METER])
  })

  it('отметка прячет видное и возвращает спрятанное', () => {
    expect(toggleMeter([], 'session')).toEqual(['session'])
    expect(toggleMeter(['session', 'weekly'], 'session')).toEqual(['weekly'])
  })
})

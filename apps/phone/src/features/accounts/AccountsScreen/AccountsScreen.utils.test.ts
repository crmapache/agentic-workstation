import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { AccountWire } from '@agentic-workstation/remote-protocol/machine-wire-types'

import {
  planLabel,
  usageTone,
  usageShare,
  accountName,
  percentText,
  windowLabel,
  accountFacts,
} from './AccountsScreen.utils'

const t = ((key: string, values: Record<string, unknown> = {}) =>
  `${key}${JSON.stringify(values)}`) as unknown as TFunction

const account = (patch: Partial<AccountWire>): AccountWire => ({
  id: '0123456789abcdef',
  alias: '',
  email: '',
  plan: 'max',
  signedIn: true,
  current: false,
  refusedUntil: null,
  usage: null,
  ...patch,
})

describe('аккаунты на телефоне', () => {
  it('имя: своё, почта, обычный вход или просто аккаунт', () => {
    expect(accountName(t, account({ alias: 'Work', email: 'w…k@x.com' }))).toBe('Work')
    expect(accountName(t, account({ email: 'w…k@x.com' }))).toBe('w…k@x.com')
    expect(accountName(t, account({ id: '' }))).toBe('accounts.default{}')
    expect(accountName(t, account({}))).toBe('accounts.untitled{}')
  })

  it('тариф словами; незнакомый - как есть, пустой - ничего', () => {
    expect(planLabel(t, 'max')).toBe(
      'accounts.plans.max{"defaultValue":"accounts.plans.other{\\"plan\\":\\"max\\"}"}',
    )
    expect(planLabel(t, '')).toBe('')
  })

  it('строка под именем: почта - только когда имя своё, затем тариф и вход', () => {
    const plain = ((key: string) =>
      key === 'accounts.plans.max' ? 'Max plan' : key) as unknown as TFunction

    expect(accountFacts(plain, account({ alias: 'Work', email: 'w…k@x.com' }))).toBe(
      'w…k@x.com · Max plan · accounts.signedIn',
    )
    expect(accountFacts(plain, account({ email: 'w…k@x.com', signedIn: false }))).toBe(
      'Max plan · accounts.signedOut',
    )
    expect(accountFacts(plain, account({ plan: '', signedIn: null }))).toBe('')
  })

  it('окно лимита: неделя одной модели - с её именем', () => {
    expect(windowLabel(t, { group: 'session', model: '', percent: 1, resetsAt: null })).toBe(
      'accounts.windows.session{"defaultValue":"session"}',
    )
    expect(windowLabel(t, { group: 'weekly', model: 'Opus', percent: 1, resetsAt: null })).toBe(
      'accounts.windows.weeklyModel{"model":"Opus"}',
    )
  })

  it('проценты целыми, полоса до края, тон по ступеням', () => {
    expect(percentText(42.6)).toBe('43%')
    expect(percentText(-1)).toBe('0%')
    expect(usageShare(130)).toBe(1)
    expect(usageShare(25)).toBe(0.25)
    expect([10, 55, 85, 100].map(usageTone)).toEqual(['success', 'warning', 'high', 'danger'])
  })
})

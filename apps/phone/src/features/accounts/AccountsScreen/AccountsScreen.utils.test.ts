import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { AccountWire } from '@agentic-workstation/remote-protocol/machine-wire-types'

import {
  usageTone,
  usageShare,
  accountName,
  percentText,
  windowLabel,
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

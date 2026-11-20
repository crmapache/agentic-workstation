import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { ConversationWire } from '@agentic-workstation/remote-protocol/wire-types'

import { usageTone, usageShare, percentText, windowLabel, conversationMeters } from './usage.utils'

const t = ((key: string, values: Record<string, unknown> = {}) =>
  `${key}${JSON.stringify(values)}`) as unknown as TFunction

const conversation = (patch: Partial<ConversationWire>): ConversationWire =>
  ({ context: { tokens: 0, window: 0 }, usage: null, ...patch }) as ConversationWire

describe('лимиты на телефоне', () => {
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

  it('под полем разговора: контекст, затем окна его аккаунта по часам телефона', () => {
    const meters = conversationMeters(
      t,
      conversation({
        context: { tokens: 50_000, window: 200_000 },
        usage: {
          windows: [
            { group: 'session', model: '', percent: 40, resetsAt: 10_000 },
            { group: 'weekly', model: '', percent: 90, resetsAt: 2_000 },
          ],
          extra: null,
          fetchedAt: 0,
        },
      }),
      5_000,
      1_000,
    )

    expect(
      meters.map(({ key, percent, tone, resetsAt }) => [key, percent, tone, resetsAt]),
    ).toEqual([
      ['context', 25, 'success', null],
      ['session|', 40, 'success', 9_000],
      // Сброс уже прошёл по часам телефона: окно новое и пустое.
      ['weekly|', 0, 'success', 1_000],
    ])
  })

  it('исчерпанное окно с доплатой горит; без окна контекста и лимитов - пусто', () => {
    const [burning] = conversationMeters(
      t,
      conversation({
        usage: {
          windows: [{ group: 'session', model: '', percent: 100, resetsAt: null }],
          extra: 12,
          fetchedAt: 0,
        },
      }),
      0,
      0,
    )

    expect(burning).toMatchObject({ burning: true, tone: 'accent' })
    expect(conversationMeters(t, conversation({}), 0, 0)).toEqual([])
  })
})

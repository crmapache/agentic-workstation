import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { ProviderCaps } from '@agentic-workstation/remote-protocol/wire-types'

import { modeOptions, modeShortLabel } from './options.utils'

/** Подстановка вместо i18next: видно, какой ключ взят. */
const t = ((key: string) => key) as unknown as TFunction

const provider: ProviderCaps = {
  id: 'claude',
  label: 'Claude Code',
  available: true,
  models: [],
  efforts: [],
  permissionModes: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'],
}

const offOf = (unavailable?: readonly string[], current?: string) =>
  modeOptions(t, provider, unavailable, current)
    .filter((option) => option.disabled)
    .map((option) => option.value)

describe('режимы разрешений на телефоне (ADR 0076)', () => {
  it('все режимы провайдера словами окна, погашено то, что гасит IDE', () => {
    expect(modeOptions(t, provider).map((option) => option.label)).toEqual([
      'modes.default.label',
      'modes.acceptEdits.label',
      'modes.plan.label',
      'modes.auto.label',
      'modes.bypassPermissions.label',
    ])
    expect(offOf(['auto', 'bypassPermissions'])).toEqual(['auto', 'bypassPermissions'])
  })

  it('старая IDE погашенного не шлёт - доступно всё', () => {
    expect(offOf(undefined)).toEqual([])
  })

  it('текущий режим разговора не гасится, как и у окна', () => {
    expect(offOf(['bypassPermissions'], 'bypassPermissions')).toEqual([])
  })

  it('в строке под заголовком - только режим, в котором разговор оставили работать сам', () => {
    expect(modeShortLabel(t, 'default')).toBeNull()
    expect(modeShortLabel(t, 'bypassPermissions')).toBe('modes.bypassPermissions.short')
    expect(modeShortLabel(t, 'plan')).toBe('modes.plan.short')
  })
})

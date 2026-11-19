import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { ProviderCaps } from '@agentic-workstation/remote-protocol/wire-types'

import { effortsOf, modeOptions, effortOptions, modeShortLabel } from './options.utils'

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

describe('усилие на телефоне - уровнями модели провайдера', () => {
  const codex: ProviderCaps = {
    id: 'codex',
    label: 'Codex',
    available: true,
    models: [
      { value: 'gpt-5.5', label: 'GPT-5.5', description: '', efforts: ['minimal', 'low', 'high'] },
      { value: 'gpt-5.5-mini', label: 'Mini', description: '' },
    ],
    efforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
    permissionModes: ['default', 'readOnly'],
  }

  it('у модели свои уровни - её, иначе провайдера; ultra и minimal - словами протокола', () => {
    expect(effortsOf(codex, 'gpt-5.5')).toEqual(['minimal', 'low', 'high'])
    expect(effortsOf(codex, 'gpt-5.5-mini')).toEqual(codex.efforts)
    expect(effortsOf(codex, null)).toEqual(codex.efforts)
    expect(effortOptions(t, codex).map((option) => option.value)).toEqual([
      '',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
      'ultra',
    ])
  })

  it('уровень, которого протокол не знает (IDE новее), не предлагается', () => {
    expect(
      effortOptions(t, { ...codex, efforts: ['low', 'warp'] }).map((option) => option.value),
    ).toEqual(['', 'low'])
  })
})

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

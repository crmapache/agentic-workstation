import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { ProviderCaps } from '@agentic-workstation/remote-protocol/wire-types'

import {
  effortsOf,
  modeOptions,
  effortOptions,
  modeShortLabel,
  newModeOptions,
  defaultUnattendedProvider,
  unattendedProviderOptions,
} from './options.utils'

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

  it('у нового разговора первым - «как в IDE», и оно не гасится', () => {
    const options = newModeOptions(t, provider, ['bypassPermissions'])

    expect(options[0]).toEqual({ value: '', label: 'options.defaultMode' })
    expect(options.slice(1).map((option) => option.value)).toEqual(provider.permissionModes)
    expect(options.filter((option) => option.disabled).map((option) => option.value)).toEqual([
      'bypassPermissions',
    ])
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

describe('провайдер прогона и часа с телефона (ADR 0094)', () => {
  const antigravity: ProviderCaps = {
    ...provider,
    id: 'antigravity',
    label: 'Antigravity',
    chatOnly: true,
  }
  const codexMissing: ProviderCaps = { ...provider, id: 'codex', label: 'Codex', available: false }

  it('кто только для чата - виден погашенным с причиной, кого нет на машине - не виден', () => {
    expect(unattendedProviderOptions(t, [provider, codexMissing, antigravity])).toEqual([
      { value: 'claude', label: 'Claude Code' },
      {
        value: 'antigravity',
        label: 'Antigravity',
        description: 'options.chatOnly',
        disabled: true,
      },
    ])
  })

  it('по умолчанию - первый, кто возьмёт работу; только чат и только отсутствующие - пусто', () => {
    expect(defaultUnattendedProvider([antigravity, codexMissing, provider])).toBe('claude')
    expect(defaultUnattendedProvider([antigravity, codexMissing])).toBe('')
  })

  it('IDE старше правила флага не шлёт - выбрать можно любого на машине', () => {
    const old: ProviderCaps = { ...provider, id: 'antigravity', label: 'Antigravity' }

    expect(unattendedProviderOptions(t, [old]).map((one) => one.disabled)).toEqual([undefined])
    expect(defaultUnattendedProvider([old])).toBe('antigravity')
  })
})

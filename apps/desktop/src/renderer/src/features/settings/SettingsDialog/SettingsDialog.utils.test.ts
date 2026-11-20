import { it, expect, describe } from 'vitest'

import type { ProviderInfo } from '@shared/providers'

import { editChoice, nextFallback, clampPasteCollapse } from './SettingsDialog.utils'

const provider = (id: ProviderInfo['id'], patch: Partial<ProviderInfo> = {}): ProviderInfo => ({
  id,
  label: id,
  available: true,
  unavailable: null,
  modes: [],
  efforts: ['low', 'high'],
  models: [
    {
      value: 'big',
      displayName: 'Big',
      description: '',
      isDefault: true,
      custom: false,
      efforts: ['low', 'high'],
    },
    { value: 'small', displayName: 'Small', description: '', custom: false, efforts: ['low'] },
  ],
  ...patch,
})

describe('порог сворачивания вставки', () => {
  it('целое в пределах, пустое и нечитаемое - прежнее', () => {
    expect(clampPasteCollapse('7', 2)).toBe(7)
    expect(clampPasteCollapse('1', 2)).toBe(2)
    expect(clampPasteCollapse('900', 2)).toBe(500)
    expect(clampPasteCollapse('', 9)).toBe(9)
  })
})

describe('цепочка сообщения коммита', () => {
  it('запасной - провайдер, которого ещё нет, только из тех, кто возьмёт работу IDE', () => {
    const providers = [
      provider('claude'),
      provider('antigravity', { chatOnly: true }),
      provider('codex', { available: false }),
      provider('kimi'),
    ]

    expect(nextFallback([{ provider: 'claude', model: '', effort: '' }], providers)).toEqual({
      provider: 'kimi',
      model: '',
      effort: '',
    })
    expect(
      nextFallback(
        [
          { provider: 'claude', model: '', effort: '' },
          { provider: 'kimi', model: '', effort: '' },
        ],
        providers,
      ).provider,
    ).toBe('claude')
  })

  it('другой провайдер - модель и усилие заново, модель без усилия - усилие по умолчанию', () => {
    const choice = { provider: 'claude' as const, model: 'big', effort: 'high' as const }

    expect(editChoice(choice, { provider: 'codex' }, provider('claude'))).toEqual({
      provider: 'codex',
      model: '',
      effort: '',
    })
    expect(editChoice(choice, { model: 'small' }, provider('claude'))).toEqual({
      provider: 'claude',
      model: 'small',
      effort: '',
    })
    expect(editChoice(choice, { effort: 'low' }, provider('claude')).effort).toBe('low')
  })
})

import { it, expect, describe } from 'vitest'

import type { ProviderInfo } from '@shared/providers'

import {
  editChoice,
  nextFallback,
  reminderParts,
  reminderAmount,
  clampPasteCollapse,
} from './SettingsDialog.utils'

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

describe('напоминания о звонке', () => {
  it('показывает минуты самой крупной единицей, которой они делятся нацело', () => {
    expect(reminderParts(10)).toEqual({ amount: 10, unit: 'minutes' })
    expect(reminderParts(90)).toEqual({ amount: 90, unit: 'minutes' })
    expect(reminderParts(120)).toEqual({ amount: 2, unit: 'hours' })
    expect(reminderParts(2880)).toEqual({ amount: 2, unit: 'days' })
    expect(reminderParts(0)).toEqual({ amount: 0, unit: 'minutes' })
  })

  it('берёт из поля только целое от нуля', () => {
    expect(reminderAmount(' 15 ')).toBe(15)
    expect(reminderAmount('0')).toBe(0)
    expect(reminderAmount('')).toBeNull()
    expect(reminderAmount('1.5')).toBeNull()
    expect(reminderAmount('-3')).toBeNull()
  })
})

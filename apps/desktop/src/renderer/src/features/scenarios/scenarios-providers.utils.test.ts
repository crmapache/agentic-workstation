import { it, expect, describe } from 'vitest'

import type { ProviderInfo } from '@shared/providers'

import { providerModels, defaultProvider } from './scenarios-providers.utils'

const OPUS = { value: 'opus', displayName: 'Opus', description: '', custom: false }

const provider = (available: boolean, models?: ProviderInfo['models']): ProviderInfo => ({
  id: 'claude',
  label: 'Claude Code',
  available,
  unavailable: available ? null : 'noCli',
  ...(models ? { models } : {}),
})

describe('провайдер сценария', () => {
  it('по умолчанию - первый на месте, иначе первый, пусто - никого', () => {
    expect(defaultProvider([provider(false), provider(true)])?.available).toBe(true)
    expect(defaultProvider([provider(false)])?.available).toBe(false)
    expect(defaultProvider([])).toBeNull()
  })

  it('модели - из описания провайдера; нет провайдера или моделей - пусто', () => {
    expect(providerModels(provider(true, [OPUS]))).toEqual([OPUS])
    expect(providerModels(provider(true))).toEqual([])
    expect(providerModels(null)).toEqual([])
  })
})

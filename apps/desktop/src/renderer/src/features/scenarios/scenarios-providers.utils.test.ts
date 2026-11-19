import { it, expect, describe } from 'vitest'

import { CLAUDE_CAPABILITIES } from '@shared/panel-capabilities'
import type { ProviderInfo } from '@shared/providers'

import { providerModels } from './scenarios-providers.utils'

const OPUS = { value: 'opus', displayName: 'Opus', description: '', custom: false }

const provider = (available: boolean, models?: ProviderInfo['models']): ProviderInfo => ({
  id: 'claude',
  label: 'Claude Code',
  available,
  unavailable: available ? null : 'noCli',
  modes: CLAUDE_CAPABILITIES.modes,
  efforts: CLAUDE_CAPABILITIES.efforts,
  ...(models ? { models } : {}),
})

describe('провайдер сценария', () => {
  it('модели - из описания провайдера; нет провайдера или моделей - пусто', () => {
    expect(providerModels(provider(true, [OPUS]))).toEqual([OPUS])
    expect(providerModels(provider(true))).toEqual([])
    expect(providerModels(null)).toEqual([])
  })
})

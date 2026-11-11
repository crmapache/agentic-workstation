import { it, expect, describe } from 'vitest'

import type { ClaudeState } from '@shared/claude'
import { DEFAULT_PANEL_PREFS } from '@shared/claude-prefs'

import { claudeModels, claudeProviderOf, CLAUDE_FALLBACK_MODELS } from './claude-provider'

const CATALOG = [
  { value: 'default', displayName: 'Default (recommended)', description: 'Opus 5.5' },
  { value: 'opus', displayName: 'Opus', description: 'For complex work' },
  { value: 'haiku', displayName: 'Haiku', description: 'Fastest', fast: true },
]

const stateOf = (
  cli: ClaudeState['cli'],
  models: ClaudeState['models'],
  customModels: string[] = [],
): Pick<ClaudeState, 'cli' | 'models' | 'prefs'> => ({
  cli,
  models,
  prefs: { ...DEFAULT_PANEL_PREFS, customModels },
})

describe('модели Claude Code как провайдера', () => {
  it('каталог аккаунта по порядку CLI, за ним свои модели, которых в каталоге нет', () => {
    expect(claudeModels(CATALOG, ['my-gateway-model', 'opus', 'my-gateway-model'])).toEqual([
      {
        value: 'default',
        displayName: 'Default (recommended)',
        description: 'Opus 5.5',
        custom: false,
      },
      { value: 'opus', displayName: 'Opus', description: 'For complex work', custom: false },
      { value: 'haiku', displayName: 'Haiku', description: 'Fastest', custom: false },
      {
        value: 'my-gateway-model',
        displayName: 'my-gateway-model',
        description: '',
        custom: true,
      },
    ])
  })

  it('каталога ещё нет - семьи, которые CLI знает всегда', () => {
    expect(claudeModels([], []).map((model) => model.value)).toEqual(
      CLAUDE_FALLBACK_MODELS.map((model) => model.value),
    )
  })

  it('по состоянию панели: CLI ищут - молчать, нашёлся - на месте, нет - причина', () => {
    expect(claudeProviderOf(stateOf('unknown', CATALOG))).toBeNull()
    expect(claudeProviderOf(stateOf('found', CATALOG, ['x']))).toMatchObject({
      id: 'claude',
      available: true,
      unavailable: null,
    })
    expect(claudeProviderOf(stateOf('found', CATALOG, ['x']))?.models?.at(-1)).toMatchObject({
      value: 'x',
      custom: true,
    })
    expect(claudeProviderOf(stateOf('missing', []))).toMatchObject({
      available: false,
      unavailable: 'noCli',
    })
  })
})

import { it, expect, describe } from 'vitest'

import type { ClaudeState } from '@shared/claude'
import { DEFAULT_PANEL_PREFS } from '@shared/claude-prefs'
import type { ProviderInfo } from '@shared/providers'

import { ProviderWatch } from './provider-registry'

const OPUS = { value: 'opus', displayName: 'Opus', description: '' }

const stateOf = (
  cli: ClaudeState['cli'],
  models: ClaudeState['models'],
  customModels: string[] = [],
): Pick<ClaudeState, 'cli' | 'models' | 'prefs'> => ({
  cli,
  models,
  prefs: { ...DEFAULT_PANEL_PREFS, customModels },
})

describe('провайдеры окну свежими', () => {
  it('событие - только когда список правда стал другим', () => {
    const sent: ProviderInfo[][] = []
    const watch = new ProviderWatch((providers) => sent.push(providers))

    watch.claudeChanged(stateOf('unknown', []))
    watch.claudeChanged(stateOf('found', [OPUS]))
    watch.claudeChanged(stateOf('found', [OPUS]))
    watch.claudeChanged(stateOf('found', [OPUS], ['my-model']))
    watch.claudeChanged(stateOf('missing', [OPUS], ['my-model']))

    expect(
      sent.map(([claude]) => [claude?.available, claude?.models?.map((m) => m.value)]),
    ).toEqual([
      [true, ['opus']],
      [true, ['opus', 'my-model']],
      [false, ['opus', 'my-model']],
    ])
  })
})

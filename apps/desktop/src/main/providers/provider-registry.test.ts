import { it, expect, describe } from 'vitest'

import type { AgentPanelState } from '@shared/conversation'
import {
  CODEX_CAPABILITIES,
  CLAUDE_CAPABILITIES,
  OPENCODE_CAPABILITIES,
} from '@shared/panel-capabilities'
import { DEFAULT_PANEL_PREFS } from '@shared/panel-prefs'
import type { ProviderInfo } from '@shared/providers'

import type { AgentPanel } from '../agents/panel/agent-panel'
import { ProviderWatch } from './provider-registry'

const OPUS = { value: 'opus', displayName: 'Opus', description: '' }

const stateOf = (
  cli: AgentPanelState['cli'],
  models: AgentPanelState['models'],
  customModels: string[] = [],
  capabilities = CLAUDE_CAPABILITIES,
): Pick<AgentPanelState, 'cli' | 'models' | 'prefs' | 'capabilities'> => ({
  cli,
  models,
  prefs: { ...DEFAULT_PANEL_PREFS, customModels },
  capabilities,
})

describe('провайдеры окну свежими', () => {
  it('событие - только когда список правда стал другим', () => {
    const sent: ProviderInfo[][] = []
    const watch = new ProviderWatch((providers) => sent.push(providers), { find: () => undefined })

    watch.changed('claude', stateOf('unknown', []))
    watch.changed('claude', stateOf('found', [OPUS]))
    watch.changed('claude', stateOf('found', [OPUS]))
    watch.changed('claude', stateOf('found', [OPUS], ['my-model']))
    watch.changed('claude', stateOf('missing', [OPUS], ['my-model']))

    expect(
      sent.map(([claude]) => [claude?.available, claude?.models?.map((m) => m.value)]),
    ).toEqual([
      [true, ['opus']],
      [true, ['opus', 'my-model']],
      [false, ['opus', 'my-model']],
    ])
  })

  it('открытые модели - со своими режимами и уровнями у модели; пока CLI ищут - их нет', () => {
    const sent: ProviderInfo[][] = []
    const claudeNow = stateOf('found', [OPUS])
    const watch = new ProviderWatch((providers) => sent.push(providers), {
      find: (id) =>
        id === 'claude' ? ({ getState: () => claudeNow } as unknown as AgentPanel) : undefined,
    })
    const gpt = {
      value: 'ollama/gpt-oss:20b',
      displayName: 'gpt-oss:20b',
      description: '',
      efforts: ['low', 'medium', 'high'] as const,
      group: { id: 'ollama', label: 'Ollama' },
    }

    watch.changed('claude', stateOf('found', [OPUS]))
    watch.changed('opencode', stateOf('unknown', [gpt], [], OPENCODE_CAPABILITIES))
    watch.changed('opencode', stateOf('found', [gpt], [], OPENCODE_CAPABILITIES))

    expect(sent).toHaveLength(2)
    expect(sent[1]?.map((provider) => provider.id)).toEqual(['claude', 'opencode'])
    expect(sent[1]?.[1]).toMatchObject({
      label: 'Open models',
      available: true,
      modes: OPENCODE_CAPABILITIES.modes,
      models: [{ value: 'ollama/gpt-oss:20b', efforts: ['low', 'medium', 'high'], custom: false }],
    })
    expect(sent[1]?.[0]?.modes).toContain('auto')
  })

  it('первое событие от Codex - в списке и Claude, по его текущему состоянию', () => {
    const sent: ProviderInfo[][] = []
    const claudeState = stateOf('found', [OPUS])
    const watch = new ProviderWatch((providers) => sent.push(providers), {
      find: (id) =>
        id === 'claude' ? ({ getState: () => claudeState } as unknown as AgentPanel) : undefined,
    })

    watch.changed('codex', stateOf('found', [], [], CODEX_CAPABILITIES))

    expect(sent[0]?.map((provider) => provider.id)).toEqual(['claude', 'codex'])
  })
})

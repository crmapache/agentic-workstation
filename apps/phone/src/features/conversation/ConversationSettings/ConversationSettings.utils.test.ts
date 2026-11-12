import { it, expect, describe } from 'vitest'

import type {
  ProviderCaps,
  ConversationWire,
} from '@agentic-workstation/remote-protocol/wire-types'

import { fastOffered, fastStateKey } from './ConversationSettings.utils'

const provider: ProviderCaps = {
  id: 'claude',
  label: 'Claude Code',
  available: true,
  models: [
    { value: 'opus', label: 'Opus', description: '', fast: true },
    { value: 'sonnet', label: 'Sonnet', description: '' },
  ],
  efforts: [],
  permissionModes: [],
}

const conversation = (patch: Partial<ConversationWire>): ConversationWire =>
  ({ model: null, activeModel: null, ...patch }) as ConversationWire

describe('быстрый режим разговора', () => {
  it('виден у модели, которая его умеет, или если его уже попросили', () => {
    expect(fastOffered(conversation({ model: 'opus' }), provider)).toBe(true)
    expect(fastOffered(conversation({ activeModel: 'opus' }), provider)).toBe(true)
    expect(fastOffered(conversation({ model: 'sonnet' }), provider)).toBe(false)
    expect(
      fastOffered(conversation({ model: 'sonnet', fast: { asked: true, state: null } }), provider),
    ).toBe(true)
  })

  it('под переключателем - что CLI сказал; попросили, а он молчит, - со следующим сообщением', () => {
    expect(fastStateKey(undefined)).toBeNull()
    expect(fastStateKey({ asked: false, state: null })).toBeNull()
    expect(fastStateKey({ asked: true, state: null })).toBe('conversation.fast.states.waiting')
    expect(fastStateKey({ asked: true, state: 'cooldown' })).toBe(
      'conversation.fast.states.cooldown',
    )
  })
})

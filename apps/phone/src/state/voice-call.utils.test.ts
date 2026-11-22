import { it, expect, describe } from 'vitest'

import type { VoiceCallWire } from '@agentic-workstation/remote-protocol/agent-messages'

import { canStopCall, isCallActive, startingCall, applyVoiceEvent } from './voice-call.utils'

const CALL: VoiceCallWire = {
  callId: 'call1',
  conversationId: 'c1',
  projectKey: 'p-home',
  provider: 'claude',
  state: 'listening',
  tool: null,
  heard: '',
  muted: false,
  language: null,
}

describe('applyVoiceEvent', () => {
  it('goes live on its own start and keeps where the chat is', () => {
    const live = applyVoiceEvent(startingCall('r1'), { kind: 'started', ref: 'r1', call: CALL })

    expect(live).toMatchObject({ phase: 'live', projectKey: 'p-home', conversationId: 'c1' })
    expect(isCallActive(live)).toBe(true)
  })

  it('ignores an answer to another request', () => {
    const call = startingCall('r2')

    expect(applyVoiceEvent(call, { kind: 'started', ref: 'r1', call: CALL })).toBe(call)
    expect(applyVoiceEvent(call, { kind: 'refused', ref: 'r1', reason: 'busy' })).toBe(call)
  })

  it('takes a state that comes before the start', () => {
    const call = applyVoiceEvent(startingCall('r1'), { kind: 'state', call: CALL })

    expect(call).toMatchObject({ phase: 'starting', call: CALL })
  })

  it('ends only its own call', () => {
    const live = applyVoiceEvent(startingCall('r1'), { kind: 'started', ref: 'r1', call: CALL })
    const ended = applyVoiceEvent(live, {
      kind: 'ended',
      callId: 'call1',
      reason: 'hangup',
      conversationId: 'c1',
      projectKey: 'p-home',
    })

    expect(ended).toMatchObject({ phase: 'ended', reason: 'hangup' })
    expect(isCallActive(ended)).toBe(false)
    expect(
      applyVoiceEvent(live, {
        kind: 'ended',
        callId: 'other',
        reason: 'hangup',
        conversationId: 'c1',
        projectKey: 'p-home',
      }),
    ).toBe(live)
  })
})

describe('canStopCall', () => {
  it('lets Stop work while the call speaks or the agent works, not while it only listens', () => {
    expect(canStopCall('speaking')).toBe(true)
    expect(canStopCall('working')).toBe(true)
    expect(canStopCall('thinking')).toBe(true)
    expect(canStopCall('listening')).toBe(false)
    expect(canStopCall('paused')).toBe(false)
  })
})

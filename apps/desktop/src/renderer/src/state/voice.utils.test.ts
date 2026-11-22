import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import { canStopCall, callStateText } from './voice.utils'

const t = ((key: string, options?: { tool?: string }) =>
  options?.tool ? `${key}:${options.tool}` : key) as unknown as TFunction

describe('callStateText', () => {
  it('names the tool while the agent works', () => {
    expect(callStateText(t, { state: 'working', tool: 'Bash' })).toBe(
      'voice.state.workingTool:Bash',
    )
  })

  it('says the state otherwise', () => {
    expect(callStateText(t, { state: 'listening', tool: null })).toBe('voice.state.listening')
    expect(callStateText(t, { state: 'working', tool: null })).toBe('voice.state.working')
  })
})

describe('canStopCall', () => {
  it('lets Stop work while the call speaks or the agent works, not while it only listens', () => {
    expect(canStopCall({ state: 'speaking', agentBusy: false })).toBe(true)
    expect(canStopCall({ state: 'working', agentBusy: true })).toBe(true)
    expect(canStopCall({ state: 'listening', agentBusy: false })).toBe(false)
    expect(canStopCall({ state: 'paused', agentBusy: true })).toBe(true)
  })
})

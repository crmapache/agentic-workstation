import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import { callStateText } from './voice.utils'

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

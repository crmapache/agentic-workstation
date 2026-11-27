import { it, expect, describe } from 'vitest'

import type { ConnectorAvailability } from './connector-availability'
import { isWalkthroughReady, walkthroughMissing } from './walkthrough'

const everywhere: ConnectorAvailability = { mode: 'all' }
const onlyIn = (path: string): ConnectorAvailability => ({ mode: 'only', projects: [path] })

describe('walkthrough readiness (ADR 0134)', () => {
  const computer = { kind: 'computer' as const, enabled: true, availability: everywhere }
  const browser = { kind: 'browser' as const, enabled: true, availability: onlyIn('/a') }
  const walkthrough = { kind: 'walkthrough' as const, enabled: true, availability: everywhere }

  it('needs Computer Use and Browser turned on', () => {
    expect(walkthroughMissing([], null)).toEqual(['computer', 'browser'])
    expect(walkthroughMissing([computer, { ...browser, enabled: false }], null)).toEqual([
      'browser',
    ])
    expect(walkthroughMissing([computer, browser], null)).toEqual([])
  })

  it('in a project also needs them seen there', () => {
    expect(walkthroughMissing([computer, browser], '/b')).toEqual(['browser'])
    expect(isWalkthroughReady([computer, browser, walkthrough], '/a')).toBe(true)
    expect(isWalkthroughReady([computer, browser, walkthrough], '/b')).toBe(false)
    expect(isWalkthroughReady([computer, browser], '/a')).toBe(false)
    expect(isWalkthroughReady([computer, browser, { ...walkthrough, enabled: false }], '/a')).toBe(
      false,
    )
  })
})

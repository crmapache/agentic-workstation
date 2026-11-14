import { it, expect, describe } from 'vitest'

import { isCapsuleInShots } from './capsule-capture'

describe('capsule in screenshots', () => {
  it('is hidden by the system on a Mac and on Windows 10 2004 and newer', () => {
    expect(isCapsuleInShots(false, '25.0.0')).toBe(false)
    expect(isCapsuleInShots(true, '10.0.19041')).toBe(false)
    expect(isCapsuleInShots(true, '10.0.26100')).toBe(false)
  })

  it('shows up on older Windows 10, so it has to be hidden for the shot', () => {
    expect(isCapsuleInShots(true, '10.0.17763')).toBe(true)
    expect(isCapsuleInShots(true, '10.0.18363')).toBe(true)
  })

  it('trusts the system when the version cannot be read', () => {
    expect(isCapsuleInShots(true, 'unknown')).toBe(false)
  })
})

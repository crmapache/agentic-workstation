import { it, expect, describe } from 'vitest'

import { parentFolder } from './projects.utils'

describe('parentFolder', () => {
  it('папка над путём, у корня - корень', () => {
    expect(parentFolder('/Users/max/Projects/agentic-workstation')).toBe('/Users/max/Projects')
    expect(parentFolder('/x')).toBe('/')
  })
})

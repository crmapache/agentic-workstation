import { it, expect, describe } from 'vitest'

import { spanHolds, hasDefinitions } from './definition.utils'

describe('hasDefinitions', () => {
  it('takes TypeScript and JavaScript of every flavour', () => {
    for (const path of ['a.ts', 'a.tsx', 'a.d.ts', 'a.mts', 'a.cjs', 'a.jsx', 'A.JS']) {
      expect(hasDefinitions(path)).toBe(true)
    }
  })

  it('leaves out everything else', () => {
    for (const path of ['a.md', 'a.json', 'a.scss', 'a.tsv', 'Makefile']) {
      expect(hasDefinitions(path)).toBe(false)
    }
  })
})

describe('spanHolds', () => {
  it('counts both ends of the name', () => {
    expect(spanHolds({ start: 4, end: 9 }, 4)).toBe(true)
    expect(spanHolds({ start: 4, end: 9 }, 9)).toBe(true)
    expect(spanHolds({ start: 4, end: 9 }, 10)).toBe(false)
  })
})

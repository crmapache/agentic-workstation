import { it, expect, describe } from 'vitest'

import type { RewindPreviewWire } from '@agentic-workstation/remote-protocol/conversation-wire-types'

import { rewindScopes, effectiveScope } from './RewindSheet.utils'

const ready: RewindPreviewWire = {
  state: 'ready',
  files: ['{project}/src/a.ts'],
  count: 1,
  insertions: 3,
  deletions: 1,
}

describe('откат с телефона: что можно вернуть', () => {
  it('код - только когда IDE знает файлы; только код - не посреди хода', () => {
    expect(rewindScopes(undefined, false)).toEqual(['conversation'])
    expect(rewindScopes({ state: 'off' }, false)).toEqual(['conversation'])
    expect(rewindScopes(ready, false)).toEqual(['both', 'conversation', 'code'])
    expect(rewindScopes(ready, true)).toEqual(['both', 'conversation'])
  })

  it('выбор, ставший недоступным, - первое доступное', () => {
    expect(effectiveScope(null, ['both', 'conversation'])).toBe('both')
    expect(effectiveScope('code', ['both', 'conversation'])).toBe('both')
    expect(effectiveScope('conversation', ['both', 'conversation'])).toBe('conversation')
    expect(effectiveScope('both', ['conversation'])).toBe('conversation')
  })
})

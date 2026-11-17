import { it, expect, describe } from 'vitest'

import { nextMode } from './pane-keys.utils'

describe('Shift+Tab по режимам', () => {
  it('круг терминала, недоступные режимы пропускаются', () => {
    const all = { bypass: true, auto: true }

    expect(nextMode('default', all)).toBe('acceptEdits')
    expect(nextMode('acceptEdits', all)).toBe('plan')
    expect(nextMode('plan', all)).toBe('bypassPermissions')
    expect(nextMode('bypassPermissions', all)).toBe('auto')
    expect(nextMode('auto', all)).toBe('default')
    expect(nextMode('plan', { bypass: false, auto: true })).toBe('auto')
    expect(nextMode('plan', { bypass: false, auto: false })).toBe('default')
  })
})

import { it, expect, describe } from 'vitest'

import { PERMISSION_MODES } from '@shared/conversation'
import { CODEX_CAPABILITIES } from '@shared/panel-capabilities'

import { nextMode } from './pane-keys.utils'

describe('Shift+Tab по режимам', () => {
  it('круг терминала, недоступные режимы пропускаются', () => {
    const all = { bypass: true, auto: true }

    expect(nextMode('default', all, PERMISSION_MODES)).toBe('acceptEdits')
    expect(nextMode('acceptEdits', all, PERMISSION_MODES)).toBe('plan')
    expect(nextMode('plan', all, PERMISSION_MODES)).toBe('bypassPermissions')
    expect(nextMode('bypassPermissions', all, PERMISSION_MODES)).toBe('auto')
    expect(nextMode('auto', all, PERMISSION_MODES)).toBe('default')
    expect(nextMode('plan', { bypass: false, auto: true }, PERMISSION_MODES)).toBe('auto')
    expect(nextMode('plan', { bypass: false, auto: false }, PERMISSION_MODES)).toBe('default')
  })

  it('режимы провайдера: у Codex нет «авто», зато есть «только чтение»', () => {
    const all = { bypass: true, auto: true }
    const { modes } = CODEX_CAPABILITIES

    expect(nextMode('acceptEdits', all, modes)).toBe('readOnly')
    expect(nextMode('readOnly', all, modes)).toBe('plan')
    expect(nextMode('plan', all, modes)).toBe('bypassPermissions')
    expect(nextMode('bypassPermissions', all, modes)).toBe('default')
    expect(nextMode('auto', all, modes)).toBe('default')
  })
})

import { it, expect, describe } from 'vitest'

import { CODEX_CAPABILITIES, CLAUDE_CAPABILITIES } from '@shared/panel-capabilities'
import type { ProviderId, ProviderInfo } from '@shared/providers'

import { effectiveProvider } from './providers.queries'

const provider = (id: ProviderId, available: boolean): ProviderInfo => ({
  id,
  label: id,
  available,
  unavailable: available ? null : 'noCli',
  modes: id === 'claude' ? CLAUDE_CAPABILITIES.modes : CODEX_CAPABILITIES.modes,
  efforts: id === 'claude' ? CLAUDE_CAPABILITIES.efforts : CODEX_CAPABILITIES.efforts,
})

describe('провайдер, на котором пойдёт работа', () => {
  const claudeMissing = [provider('claude', false), provider('codex', true)]

  it('выбор человека главнее всего, даже не установленный', () => {
    expect(effectiveProvider(claudeMissing, 'claude', 'codex')?.id).toBe('claude')
  })

  it('без выбора - провайдер сценария, если он стоит на машине', () => {
    expect(
      effectiveProvider([provider('claude', true), provider('codex', true)], null, 'codex')?.id,
    ).toBe('codex')
    expect(effectiveProvider(claudeMissing, null, 'claude')?.id).toBe('codex')
  })

  it('иначе первый, что стоит; никого не стоит - первый; пусто - нет', () => {
    expect(effectiveProvider(claudeMissing, null)?.id).toBe('codex')
    expect(effectiveProvider([provider('claude', false)], null)?.id).toBe('claude')
    expect(effectiveProvider([], null)).toBeNull()
  })
})

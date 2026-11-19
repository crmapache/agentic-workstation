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
  ...(id === 'antigravity' && { chatOnly: true }),
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

describe('провайдер только для чата (ADR 0094) сам не выбирается', () => {
  const antigravity = provider('antigravity', true)

  it('ни как провайдер сценария, ни как первый на месте', () => {
    expect(
      effectiveProvider([antigravity, provider('claude', true)], null, 'antigravity')?.id,
    ).toBe('claude')
    expect(effectiveProvider([antigravity, provider('codex', true)], null)?.id).toBe('codex')
  })

  it('на месте только он - первый из тех, кому работа разрешена, пусть и не установлен', () => {
    expect(effectiveProvider([antigravity, provider('claude', false)], null)?.id).toBe('claude')
    expect(effectiveProvider([antigravity], null)?.id).toBe('antigravity')
  })

  it('выбор человека (сохранённый час или задание) остаётся - окно скажет, почему не пойдёт', () => {
    expect(effectiveProvider([provider('claude', true), antigravity], 'antigravity')?.id).toBe(
      'antigravity',
    )
  })
})

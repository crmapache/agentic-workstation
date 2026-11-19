import { it, expect, describe } from 'vitest'

import { isUnattendedProviderId, UNATTENDED_PROVIDER_IDS } from './providers'
import { parseServiceAi } from './service-ai'

describe('работа без человека по правилу провайдера (ADR 0094)', () => {
  it('Antigravity - только в своём чате, остальные - и без человека', () => {
    expect(UNATTENDED_PROVIDER_IDS).toEqual(['claude', 'codex', 'kimi', 'opencode'])
    expect(isUnattendedProviderId('antigravity')).toBe(false)
    expect(isUnattendedProviderId('kimi')).toBe(true)
  })

  it('служебная работа на Antigravity не встаёт - остаётся провайдер по умолчанию', () => {
    expect(parseServiceAi({ provider: 'antigravity', model: '' }).provider).toBe('claude')
    expect(parseServiceAi({ provider: 'kimi', model: '' }).provider).toBe('kimi')
  })
})

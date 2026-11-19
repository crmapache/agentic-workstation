import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { ProviderId, ProviderInfo } from '@shared/providers'

import { takesIdeWork, providerChoices, providerRefusal } from './provider-choices'

/** Подстановка вместо i18next: видно, какой ключ взят. */
const t = ((key: string) => key) as unknown as TFunction

const provider = (id: ProviderId, available: boolean, chatOnly = false): ProviderInfo => ({
  id,
  label: id,
  available,
  unavailable: available ? null : 'noCli',
  modes: ['default'],
  efforts: [],
  ...(chatOnly && { chatOnly: true }),
})

const claude = provider('claude', true)

const codexMissing = provider('codex', false)

const antigravity = provider('antigravity', true, true)

describe('работа, которую начинает IDE, - кому её можно дать (ADR 0094)', () => {
  it('стоит на машине и не только для чата', () => {
    expect(takesIdeWork(claude)).toBe(true)
    expect(takesIdeWork(codexMissing)).toBe(false)
    expect(takesIdeWork(antigravity)).toBe(false)
    expect(takesIdeWork({ ...antigravity, available: false })).toBe(false)
  })

  it('причина: «только в своём чате» главнее «не установлен»', () => {
    expect(providerRefusal(claude, t)).toBeUndefined()
    expect(providerRefusal(codexMissing, t)).toBe('common.notInstalled')
    expect(providerRefusal(antigravity, t)).toBe('common.chatOnly')
    expect(providerRefusal({ ...antigravity, available: false }, t)).toBe('common.chatOnly')
  })

  it('варианты выбора: провайдер только для чата погашен всегда, не установленный - по месту', () => {
    const offOf = (allowMissing: boolean) =>
      providerChoices([claude, codexMissing, antigravity], t, allowMissing)
        .filter((one) => one.disabled)
        .map((one) => one.value)

    expect(offOf(false)).toEqual(['codex', 'antigravity'])
    // Голова сценария: пишут и под чужую машину, но не под провайдера только для чата.
    expect(offOf(true)).toEqual(['antigravity'])
    expect(providerChoices([antigravity], t)[0]).toMatchObject({
      label: 'antigravity',
      description: 'common.chatOnly',
      disabled: true,
    })
  })
})
